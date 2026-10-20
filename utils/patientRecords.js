const Patient = require("../models/Patient");
const User = require("../models/User");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("./validation");

const EMAIL_MESSAGE = "Enter a valid email address.";
const REQUIRED_PATIENT_MESSAGE = "First name and last name are required.";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const normalizeAllergies = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizePatientPayload = (body = {}) => ({
  firstName: body.firstName?.trim() || "",
  lastName: body.lastName?.trim() || "",
  email: body.email?.trim().toLowerCase() || "",
  contactNumber: normalizeMobileNumber(body.contactNumber),
  dateOfBirth: body.dateOfBirth || undefined,
  gender: body.gender || "prefer_not_to_say",
  address: body.address?.trim() || "",
  emergencyContact: body.emergencyContact?.trim() || "",
  emergencyContactName: body.emergencyContactName?.trim() || "",
  emergencyContactNumber: normalizeMobileNumber(body.emergencyContactNumber),
  guardianName: body.guardianName?.trim() || "",
  guardianRelationship: body.guardianRelationship?.trim() || "",
  guardianContactNumber: normalizeMobileNumber(body.guardianContactNumber),
  guardianEmail: body.guardianEmail?.trim().toLowerCase() || "",
  guardianAddress: body.guardianAddress?.trim() || "",
  allergies: normalizeAllergies(body.allergies),
  medicalConditions: body.medicalConditions?.trim() || "",
  medicalHistory: body.medicalHistory?.trim() || "",
  dentalHistory: body.dentalHistory?.trim() || "",
  registrationStatus: body.registrationStatus || "unverified",
  verifiedAt: body.verifiedAt || undefined,
  verificationHistory: Array.isArray(body.verificationHistory) ? body.verificationHistory : [],
  status: body.status || "active",
  assignedDentist: body.assignedDentist || undefined,
  assignedDentistName: body.assignedDentistName?.trim() || "",
  username: body.username?.trim() || "",
});

const generatePatientId = async () => {
  const year = new Date().getFullYear();
  const prefix = `FDMST-${year}-`;
  const latestPatient = await Patient.findOne({
    patientId: { $regex: `^${prefix}` },
  })
    .sort({ patientId: -1 })
    .select("patientId");

  const latestNumber = latestPatient?.patientId
    ? Number(latestPatient.patientId.replace(prefix, ""))
    : 0;

  return `${prefix}${String(latestNumber + 1).padStart(5, "0")}`;
};

const validatePatientPayload = (payload, { requireEmail = false, requireMobile = false, requireBirthDate = false } = {}) => {
  const errors = {};

  if (!payload.firstName || !payload.lastName) {
    if (!payload.firstName) errors.firstName = "First name is required.";
    if (!payload.lastName) errors.lastName = "Last name is required.";
  }

  if (requireEmail && !payload.email) {
    errors.email = "Email address is required.";
  } else if (payload.email && !EMAIL_REGEX.test(payload.email)) {
    errors.email = EMAIL_MESSAGE;
  }

  if (!isValidMobileNumber(payload.contactNumber, { required: requireMobile })) {
    errors.contactNumber = MOBILE_NUMBER_MESSAGE;
  }

  if (payload.emergencyContactNumber && !isValidMobileNumber(payload.emergencyContactNumber)) {
    errors.emergencyContactNumber = MOBILE_NUMBER_MESSAGE;
  }

  if (requireBirthDate && !payload.dateOfBirth) {
    errors.dateOfBirth = "Birth date is required.";
  }

  const age = calculateAge(payload.dateOfBirth);
  if (age !== null && age < 18) {
    if (!payload.guardianName) errors.guardianName = "Parent/guardian full name is required for patients under 18.";
    if (!payload.guardianRelationship) errors.guardianRelationship = "Relationship to patient is required for patients under 18.";
    if (!isValidMobileNumber(payload.guardianContactNumber, { required: true })) {
      errors.guardianContactNumber = MOBILE_NUMBER_MESSAGE;
    }
  } else if (payload.guardianContactNumber && !isValidMobileNumber(payload.guardianContactNumber)) {
    errors.guardianContactNumber = MOBILE_NUMBER_MESSAGE;
  }

  if (payload.guardianEmail && !EMAIL_REGEX.test(payload.guardianEmail)) {
    errors.guardianEmail = EMAIL_MESSAGE;
  }

  return errors;
};

const assertNoDuplicatePatientContact = async ({ email, contactNumber }, { excludePatientId, excludeUserId } = {}) => {
  const patientFilters = [];
  const userFilters = [];

  if (email) {
    patientFilters.push({ email });
    userFilters.push({ email });
  }

  if (contactNumber) {
    patientFilters.push({ contactNumber });
    userFilters.push({ contactNumber });
  }

  if (!patientFilters.length && !userFilters.length) return;

  const patientQuery = patientFilters.length ? { $or: patientFilters } : null;
  const userQuery = userFilters.length ? { $or: userFilters } : null;

  if (patientQuery && excludePatientId) {
    patientQuery._id = { $ne: excludePatientId };
  }

  if (userQuery && excludeUserId) {
    userQuery._id = { $ne: excludeUserId };
  }

  const [existingPatient, existingUser] = await Promise.all([
    patientQuery ? Patient.findOne(patientQuery).select("email contactNumber") : null,
    userQuery ? User.findOne(userQuery).select("email contactNumber") : null,
  ]);

  if (!existingPatient && !existingUser) return;

  const duplicateEmail = email && (existingPatient?.email === email || existingUser?.email === email);
  const duplicateMobile = contactNumber && (existingPatient?.contactNumber === contactNumber || existingUser?.contactNumber === contactNumber);
  const error = new Error(
    duplicateEmail
      ? "An account or patient record with this email already exists."
      : "An account or patient record with this mobile number already exists.",
  );

  error.status = 409;
  error.errors = duplicateEmail
    ? { email: "This email is already registered." }
    : { contactNumber: "This mobile number is already registered." };
  throw error;
};

const getClinicDentistAssignment = async () => {
  const admin = await User.findOne({ role: "admin", status: "active" })
    .sort({ createdAt: 1 })
    .select("firstName lastName")
    .lean();

  if (!admin) return {};

  return {
    assignedDentist: admin._id,
    assignedDentistName: [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim(),
  };
};

const preparePatientCreateBody = async (body, options = {}) => {
  const payload = normalizePatientPayload(body);
  const errors = validatePatientPayload(payload, options);

  if (Object.keys(errors).length) {
    const error = new Error(Object.values(errors)[0] || REQUIRED_PATIENT_MESSAGE);
    error.status = 400;
    error.errors = errors;
    throw error;
  }

  await assertNoDuplicatePatientContact(payload, options);
  const clinicDentist = payload.assignedDentist ? {} : await getClinicDentistAssignment();

  return {
    ...payload,
    ...clinicDentist,
    patientId: body.patientId || await generatePatientId(),
  };
};

const preparePatientUpdateBody = async (body, options = {}) => {
  const payload = normalizePatientPayload(body);
  const errors = validatePatientPayload(payload, options);

  if (Object.keys(errors).length) {
    const error = new Error(Object.values(errors)[0] || REQUIRED_PATIENT_MESSAGE);
    error.status = 400;
    error.errors = errors;
    throw error;
  }

  await assertNoDuplicatePatientContact(payload, options);

  return payload;
};

module.exports = {
  assertNoDuplicatePatientContact,
  generatePatientId,
  normalizePatientPayload,
  preparePatientCreateBody,
  preparePatientUpdateBody,
  validatePatientPayload,
};
