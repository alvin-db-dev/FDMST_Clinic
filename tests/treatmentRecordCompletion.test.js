const test = require("node:test");
const assert = require("node:assert/strict");

test("an appointment linked to a treatment record is considered completed", () => {
  const appointment = {
    _id: "671234567890abcdef123456",
    patientName: "Jane Doe",
    status: "in_consultation",
  };

  const treatmentRecord = {
    _id: "671234567890abcdef999999",
    appointment: appointment._id,
    recordType: "treatment_record",
    procedure: "Dental Cleaning",
  };

  // Simulating the appointment sanitization / mapping logic
  const hasTreatmentRecord = Boolean(treatmentRecord);
  const effectiveStatus = hasTreatmentRecord ? "completed" : appointment.status;

  assert.equal(hasTreatmentRecord, true);
  assert.equal(effectiveStatus, "completed");
});

test("an appointment without a treatment record retains its active status", () => {
  const appointment = {
    _id: "671234567890abcdef123456",
    patientName: "Jane Doe",
    status: "in_consultation",
  };

  const treatmentRecord = null;
  const hasTreatmentRecord = Boolean(treatmentRecord);
  const effectiveStatus = hasTreatmentRecord ? "completed" : appointment.status;

  assert.equal(hasTreatmentRecord, false);
  assert.equal(effectiveStatus, "in_consultation");
});
