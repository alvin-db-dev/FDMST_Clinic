const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");
const Feedback = require("../models/Feedback");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const User = require("../models/User");
const { authenticate, authorize } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
const FEEDBACK_CATEGORIES = ["scheduling", "service_quality", "overall_experience"];
const FEEDBACK_STATUSES = ["new", "reviewed", "resolved"];

const cleanText = (value, limit = 1500) => String(value || "")
  .replace(/[<>]/g, "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  .trim()
  .slice(0, limit);

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getPatientRecord = (user) => Patient.findOne({
  $or: [
    { userId: user.id },
    ...(user.email ? [{ email: String(user.email).toLowerCase() }] : []),
  ],
});

const patientAppointmentScope = (patient, user) => ({
  $or: [
    { patient: patient._id },
    ...(user.email ? [{ email: String(user.email).toLowerCase() }] : []),
  ],
});

const serializeAppointment = (appointment) => {
  if (!appointment) return null;
  const value = appointment.toObject ? appointment.toObject() : appointment;
  return {
    id: value._id || value.id,
    service: value.service || "Appointment",
    appointmentDate: value.appointmentDate,
    appointmentTime: value.appointmentTime || "",
    status: value.status || "",
  };
};

const serializeFeedback = (feedback) => {
  const value = feedback.toObject ? feedback.toObject() : feedback;
  const patient = value.patient && typeof value.patient === "object" ? value.patient : null;
  return {
    id: value._id || value.id,
    patient: patient ? {
      id: patient._id || patient.id,
      patientId: patient.patientId || "",
    } : null,
    patientName: value.patientName || "Patient",
    rating: value.rating,
    category: value.category,
    comments: value.comments || "",
    status: value.status || "new",
    appointment: serializeAppointment(value.appointment),
    reviewedAt: value.reviewedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const populateFeedback = (query) => query
  .populate("patient", "patientId")
  .populate("appointment", "service appointmentDate appointmentTime status");

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const [testimonials, totalRatings, averageRows] = await Promise.all([
      Feedback.find({
        status: { $in: ["reviewed", "resolved"] },
        rating: { $gte: 4 },
        comments: { $nin: [null, ""] },
      })
        .select("patientName rating comments createdAt")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Feedback.countDocuments({}),
      Feedback.aggregate([{ $group: { _id: null, average: { $avg: "$rating" } } }]),
    ]);

    res.json({
      data: testimonials.map((item) => {
        const nameParts = String(item.patientName || "Patient").trim().split(/\s+/).filter(Boolean);
        const displayName = nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
          : nameParts[0] || "Patient";
        return {
          id: item._id,
          name: displayName,
          role: "Patient",
          quote: String(item.comments || "").slice(0, 360),
          rating: item.rating,
          createdAt: item.createdAt,
        };
      }),
      summary: {
        averageRating: Number((averageRows[0]?.average || 0).toFixed(1)),
        totalRatings,
      },
    });
  }),
);

router.use(authenticate);

router.get(
  "/my",
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const patient = await getPatientRecord(req.user);
    if (!patient) {
      return res.json({ data: [], appointments: [] });
    }

    const ownershipQuery = {
      $or: [
        { patient: patient._id },
        { submittedBy: req.user.id },
      ],
    };
    const appointmentScope = patientAppointmentScope(patient, req.user);
    const [feedback, completedAppointments] = await Promise.all([
      populateFeedback(Feedback.find(ownershipQuery).sort({ createdAt: -1 }).limit(50)),
      Appointment.find({ ...appointmentScope, status: "completed" })
        .select("service appointmentDate appointmentTime status")
        .sort({ appointmentDate: -1, appointmentTime: -1 })
        .limit(50)
        .lean(),
    ]);

    const reviewedAppointmentIds = new Set(
      feedback.map((item) => String(item.appointment?._id || item.appointment || "")).filter(Boolean),
    );

    res.json({
      data: feedback.map(serializeFeedback),
      appointments: completedAppointments.map((appointment) => ({
        ...serializeAppointment(appointment),
        hasFeedback: reviewedAppointmentIds.has(String(appointment._id)),
      })),
    });
  }),
);

router.post(
  "/",
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const patient = await getPatientRecord(req.user);
    if (!patient) {
      return res.status(404).json({ message: "Your patient record could not be found." });
    }

    const rating = Number(req.body.rating);
    const category = FEEDBACK_CATEGORIES.includes(req.body.category)
      ? req.body.category
      : "overall_experience";
    const comments = cleanText(req.body.comments);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Please select a rating from 1 to 5 stars.",
        errors: { rating: "Select a rating from 1 to 5 stars." },
      });
    }
    if (comments.length < 3) {
      return res.status(400).json({
        message: "Please tell the clinic about your experience.",
        errors: { comments: "Feedback must contain at least 3 characters." },
      });
    }

    let appointment;
    const appointmentId = String(req.body.appointment || "").trim();
    if (appointmentId) {
      if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
        return res.status(400).json({ message: "Invalid appointment reference." });
      }

      appointment = await Appointment.findOne({
        _id: appointmentId,
        status: "completed",
        ...patientAppointmentScope(patient, req.user),
      }).select("service appointmentDate appointmentTime status");

      if (!appointment) {
        return res.status(404).json({ message: "Completed appointment not found." });
      }

      const existingFeedback = await Feedback.exists({ patient: patient._id, appointment: appointment._id });
      if (existingFeedback) {
        return res.status(409).json({ message: "You already submitted feedback for this appointment." });
      }
    }

    const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ").trim()
      || [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim()
      || "Patient";
    const feedback = await Feedback.create({
      patient: patient._id,
      submittedBy: req.user.id,
      appointment: appointment?._id,
      patientName,
      rating,
      category,
      comments,
      status: "new",
    });

    const admins = await User.find({ role: "admin", status: "active" }).select("_id").lean();
    await Promise.allSettled(admins.map((admin) => Notification.create({
      user: admin._id,
      title: "New patient feedback",
      message: `${patientName} submitted a ${rating}-star rating.`,
      type: "feedback",
      metadata: { feedbackId: feedback._id, target: "feedback" },
    })));

    AuditLog.create({
      action: "patient_feedback_submitted",
      entityType: "Feedback",
      entityId: feedback._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: { patient: patient._id, patientName, rating, category, appointment: appointment?._id },
    }).catch(() => {});

    const populated = await populateFeedback(Feedback.findById(feedback._id));
    res.status(201).json(serializeFeedback(populated));
  }),
);

router.get(
  "/admin",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);
    const query = {};

    if (FEEDBACK_STATUSES.includes(req.query.status)) query.status = req.query.status;
    if (FEEDBACK_CATEGORIES.includes(req.query.category)) query.category = req.query.category;
    const rating = Number(req.query.rating);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) query.rating = rating;
    const search = cleanText(req.query.search, 80);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ patientName: pattern }, { comments: pattern }];
    }

    const [feedback, filteredTotal, total, newCount, resolvedCount, averageRows] = await Promise.all([
      populateFeedback(Feedback.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
      Feedback.countDocuments(query),
      Feedback.countDocuments({}),
      Feedback.countDocuments({ status: "new" }),
      Feedback.countDocuments({ status: "resolved" }),
      Feedback.aggregate([{ $group: { _id: null, average: { $avg: "$rating" } } }]),
    ]);

    res.json({
      data: feedback.map(serializeFeedback),
      summary: {
        total,
        new: newCount,
        resolved: resolvedCount,
        averageRating: Number((averageRows[0]?.average || 0).toFixed(1)),
      },
      pagination: {
        page,
        limit,
        total: filteredTotal,
        pages: Math.max(Math.ceil(filteredTotal / limit), 1),
      },
    });
  }),
);

router.get(
  "/admin/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid feedback ID." });
    }
    const feedback = await populateFeedback(Feedback.findById(req.params.id));
    if (!feedback) return res.status(404).json({ message: "Feedback not found." });
    res.json(serializeFeedback(feedback));
  }),
);

router.patch(
  "/admin/:id/status",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid feedback ID." });
    }
    if (!FEEDBACK_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: "Invalid feedback status." });
    }

    const status = req.body.status;
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewedBy: status === "new" ? null : req.user.id,
        reviewedAt: status === "new" ? null : new Date(),
      },
      { new: true, runValidators: true },
    );
    if (!feedback) return res.status(404).json({ message: "Feedback not found." });

    AuditLog.create({
      action: `feedback_${status}`,
      entityType: "Feedback",
      entityId: feedback._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: { patientName: feedback.patientName, rating: feedback.rating },
    }).catch(() => {});

    const populated = await populateFeedback(Feedback.findById(feedback._id));
    res.json(serializeFeedback(populated));
  }),
);

module.exports = router;
