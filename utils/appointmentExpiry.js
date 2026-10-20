const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const User = require("../models/User");

const MISSED_APPOINTMENT_GRACE_MS = 60 * 60 * 1000;
const WARNING_BEFORE_DEADLINE_MS = 2 * 60 * 60 * 1000;
const JOB_INTERVAL_MS = 15 * 60 * 1000;
const AUTO_DECLINE_REASON = "Automatically cancelled because the appointment request was not confirmed before the scheduled appointment time.";
const AUTO_NO_SHOW_REASON = "Automatically marked as no-show because the patient did not check in after the scheduled appointment time.";

let intervalId = null;
let isRunning = false;

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

const getAppointmentSubmittedAt = (appointment) =>
  new Date(appointment.requestSubmittedAt || appointment.createdAt || appointment._id.getTimestamp());

const toMinutes = (value) => {
  const normalized = String(value || "").trim();
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2]);
    const period = meridiemMatch[3].toUpperCase();

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const [hours = 0, minutes = 0] = normalized.split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
};

const endOfDay = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const getAppointmentScheduledAt = (appointment) => {
  const date = appointment.appointmentDate ? new Date(appointment.appointmentDate) : getAppointmentSubmittedAt(appointment);
  if (Number.isNaN(date.getTime())) return getAppointmentSubmittedAt(appointment);

  const minutes = toMinutes(appointment.appointmentTime);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const getAutoCancelDeadline = (appointment) =>
  new Date(getAppointmentScheduledAt(appointment).getTime() + MISSED_APPOINTMENT_GRACE_MS);

const getPatientRecipient = async (appointment) => {
  const patient = appointment.patient
    ? await Patient.findById(appointment.patient).select("userId")
    : await Patient.findOne({ email: appointment.email }).select("userId");

  return patient?.userId ? { user: patient.userId, patient: patient._id } : null;
};

const createNotificationOnce = async (query, payload) => {
  const existing = await Notification.exists(query);
  if (existing) return null;
  return Notification.create(payload);
};

const notifyPatientOfAutoDecline = async (appointment) => {
  const recipient = await getPatientRecipient(appointment);
  if (!recipient) return;

  await createNotificationOnce(
    {
      user: recipient.user,
      type: "appointment",
      "metadata.appointmentId": appointment._id,
      "metadata.event": "appointment_auto_declined",
    },
    {
      ...recipient,
      title: "Appointment request cancelled",
      message: `Your ${appointment.service} appointment request was automatically cancelled because it was still pending after the scheduled appointment time.`,
      type: "appointment",
      metadata: {
        appointmentId: appointment._id,
        event: "appointment_auto_declined",
        declineReason: AUTO_DECLINE_REASON,
        scheduledAt: getAppointmentScheduledAt(appointment),
        autoCancelDeadline: getAutoCancelDeadline(appointment),
      },
    },
  );
};

const notifyPatientOfAutoNoShow = async (appointment) => {
  const recipient = await getPatientRecipient(appointment);
  if (!recipient) return;

  await createNotificationOnce(
    {
      user: recipient.user,
      type: "appointment",
      "metadata.appointmentId": appointment._id,
      "metadata.event": "appointment_auto_no_show",
    },
    {
      ...recipient,
      title: "Appointment marked as no-show",
      message: `Your ${appointment.service} appointment was marked as no-show because you did not check in after the scheduled appointment time.`,
      type: "appointment",
      metadata: {
        appointmentId: appointment._id,
        event: "appointment_auto_no_show",
        reason: AUTO_NO_SHOW_REASON,
        scheduledAt: getAppointmentScheduledAt(appointment),
        autoNoShowAt: getAutoCancelDeadline(appointment),
      },
    },
  );
};

const getClinicReviewRecipients = async (appointment) => {
  const users = await User.find({
    role: { $in: ["admin", "staff"] },
    status: "active",
  }).select("_id firstName lastName role");

  return users;
};

const notifyClinicUsersOfExpiringAppointment = async (appointment) => {
  const recipients = await getClinicReviewRecipients(appointment);
  if (!recipients.length) return;

  const deadline = getAutoCancelDeadline(appointment);
  const message = `${appointment.patientName}'s ${appointment.service} appointment will be automatically cancelled if it is not confirmed by ${deadline.toLocaleString()}.`;

  await Promise.all(recipients.map((user) =>
    createNotificationOnce(
      {
        user: user._id,
        type: "appointment",
        "metadata.appointmentId": appointment._id,
        "metadata.event": "appointment_auto_decline_warning",
      },
      {
        user: user._id,
        title: "Appointment request nearing auto-cancellation",
        message,
        type: "appointment",
        scheduledFor: deadline,
        metadata: {
          appointmentId: appointment._id,
          event: "appointment_auto_decline_warning",
          expiresAt: deadline,
        },
      },
    ),
  ));
};

const warnExpiringPendingAppointments = async (now) => {
  const candidates = await Appointment.find({
    status: "pending",
    appointmentDate: { $lte: endOfDay(now) },
    autoDeclineWarningSentAt: { $exists: false },
  })
    .limit(200)
    .lean();

  for (const appointment of candidates) {
    const deadline = getAutoCancelDeadline(appointment);
    if (deadline <= now || deadline > new Date(now.getTime() + WARNING_BEFORE_DEADLINE_MS)) continue;

    const updated = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: "pending",
        autoDeclineWarningSentAt: { $exists: false },
      },
      { autoDeclineWarningSentAt: now },
      { new: true },
    ).lean();

    if (updated) {
      await notifyClinicUsersOfExpiringAppointment(updated);
    }
  }
};

const declineOverduePendingAppointments = async (now) => {
  const overdueAppointments = await Appointment.find({
    status: "pending",
    appointmentDate: { $lte: endOfDay(now) },
    autoDeclinedAt: { $exists: false },
  })
    .limit(200)
    .lean();

  for (const appointment of overdueAppointments) {
    const deadline = getAutoCancelDeadline(appointment);
    if (deadline > now) continue;

    const cancelled = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: "pending",
        autoDeclinedAt: { $exists: false },
      },
      {
        status: "cancelled",
        declineReason: AUTO_DECLINE_REASON,
        autoDeclinedAt: now,
        statusUpdatedAt: now,
        statusUpdatedByEmail: "system@fdmst.local",
      },
      { new: true },
    );

    if (!cancelled) continue;

    await Promise.allSettled([
      notifyPatientOfAutoDecline(cancelled),
      AuditLog.create({
        action: "Appointment Auto Cancelled",
        entityType: "Appointments",
        entityId: cancelled._id,
        performedByEmail: "system@fdmst.local",
        metadata: {
          status: "cancelled",
          reason: AUTO_DECLINE_REASON,
          submittedAt: cancelled.requestSubmittedAt || cancelled.createdAt,
          scheduledAt: getAppointmentScheduledAt(cancelled),
          autoCancelDeadline: getAutoCancelDeadline(cancelled),
          autoDeclinedAt: now,
        },
      }),
    ]);
  }
};

const markMissedConfirmedAppointmentsAsNoShow = async (now) => {
  const missedAppointments = await Appointment.find({
    status: { $in: ["confirmed", "follow_up"] },
    appointmentDate: { $lte: endOfDay(now) },
    noShowAt: { $exists: false },
  })
    .limit(200)
    .lean();

  for (const appointment of missedAppointments) {
    const deadline = getAutoCancelDeadline(appointment);
    if (deadline > now) continue;

    const noShow = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: { $in: ["confirmed", "follow_up"] },
        noShowAt: { $exists: false },
      },
      {
        $set: {
          status: "no_show",
          noShowAt: now,
          noShowByEmail: "system@fdmst.local",
          estimatedRevenueAmount: 0,
          statusUpdatedAt: now,
          statusUpdatedByEmail: "system@fdmst.local",
        },
        $push: {
          timeline: {
            status: "no_show",
            action: "Appointment Auto No-Show",
            performedByEmail: "system@fdmst.local",
            note: AUTO_NO_SHOW_REASON,
            recordedAt: now,
          },
        },
      },
      { new: true },
    );

    if (!noShow) continue;

    await Promise.allSettled([
      notifyPatientOfAutoNoShow(noShow),
      AuditLog.create({
        action: "Appointment Auto No-Show",
        entityType: "Appointments",
        entityId: noShow._id,
        performedByEmail: "system@fdmst.local",
        metadata: {
          status: "no_show",
          reason: AUTO_NO_SHOW_REASON,
          scheduledAt: getAppointmentScheduledAt(noShow),
          autoNoShowAt: now,
        },
      }),
    ]);
  }
};

const normalizeLegacyAutoDeclinedAppointments = async () => {
  await Appointment.updateMany(
    {
      status: "declined",
      $or: [
        { autoDeclinedAt: { $exists: true } },
        { declineReason: AUTO_DECLINE_REASON },
      ],
    },
    {
      $set: {
        status: "cancelled",
        declineReason: AUTO_DECLINE_REASON,
      },
    },
  );
};

const runAppointmentExpiryCheck = async () => {
  if (isRunning) return;

  isRunning = true;

  try {
    const now = new Date();
    await normalizeLegacyAutoDeclinedAppointments();
    await warnExpiringPendingAppointments(now);
    await declineOverduePendingAppointments(now);
    await markMissedConfirmedAppointmentsAsNoShow(now);
  } catch (error) {
    console.error("Appointment expiry check failed:", error);
  } finally {
    isRunning = false;
  }
};

const startAppointmentExpiryMonitor = () => {
  if (intervalId) return intervalId;

  runAppointmentExpiryCheck();
  intervalId = setInterval(runAppointmentExpiryCheck, JOB_INTERVAL_MS);
  return intervalId;
};

const stopAppointmentExpiryMonitor = () => {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
};

module.exports = {
  AUTO_DECLINE_REASON,
  AUTO_NO_SHOW_REASON,
  runAppointmentExpiryCheck,
  startAppointmentExpiryMonitor,
  stopAppointmentExpiryMonitor,
};
