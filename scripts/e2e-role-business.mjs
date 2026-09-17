import assert from "node:assert/strict";

const baseUrl = process.env.AUS_E2E_BASE_URL ?? "http://127.0.0.1:8787";
const demoIdentity = {
  "oai-authenticated-user-id": "local_seedy",
  "oai-authenticated-user-email": "seedy@sites.test",
};
const independentManagerIdentity = {
  "oai-authenticated-user-id": "demo_independent_manager",
  "oai-authenticated-user-email": "manager2@example.test",
};

const checks = [];

function melbourneDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function call(
  label,
  path,
  {
    method = "GET",
    identity = demoIdentity,
    body,
    expected = 200,
    headers = {},
  } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...identity,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { origin: baseUrl }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  assert.equal(
    response.status,
    expected,
    `${label}: expected ${expected}, received ${response.status}: ${text.slice(0, 500)}`,
  );
  assert.ok(response.headers.get("x-request-id") || !path.startsWith("/api/"), `${label}: X-Request-Id missing`);
  checks.push({ label, status: response.status });
  return payload;
}

async function command(label, role, body, expected = 200, identity = demoIdentity) {
  return call(label, `/api/platform/commands?role=${encodeURIComponent(role)}`, {
    method: "POST",
    identity,
    body,
    expected,
  });
}

async function completeSession(sessionId, key, note) {
  const workspace = await call(
    `Teacher loads ${sessionId}`,
    `/api/workspace?sessionId=${encodeURIComponent(sessionId)}`,
  );
  assert.equal(workspace.selectedSession.id, sessionId);
  const payload = {
    expectedVersion: workspace.selectedSession.version,
    records: workspace.roster.map((student) => ({
      studentId: student.id,
      status: "present",
    })),
    rawClassNotes: note,
    feedback: null,
  };
  const result = await call(`Teacher completes ${sessionId}`, `/api/sessions/${sessionId}/complete`, {
    method: "POST",
    body: payload,
    headers: { "idempotency-key": key },
  });
  return { payload, result };
}

const today = melbourneDate();
const tomorrow = melbourneDate(1);

const account = await call("Account exposes all assigned roles", "/api/account");
assert.deepEqual(
  new Set(account.roles.map((role) => role.role)),
  new Set(["teacher", "operations_admin", "manager_admin", "student", "guardian", "system_admin"]),
);

for (const role of ["operations_admin", "manager_admin", "student", "guardian", "system_admin"]) {
  const overview = await call(`${role} overview`, `/api/platform/overview?role=${role}`);
  assert.equal(overview.role, role);
  assert.ok(Array.isArray(overview.sections));
  if (role === "operations_admin") {
    const trialAttention = overview.sections.find((section) => section.id === "trial-attention");
    const lowBalances = overview.sections.find((section) => section.id === "low-balances");
    const students = overview.sections.find((section) => section.id === "students");
    const workloads = overview.sections.find((section) => section.id === "admin-workloads");
    assert.ok(trialAttention?.rows.length >= 1, "Admin needs an explicit completed-trial attention queue");
    assert.ok(lowBalances?.rows.length >= 1, "Admin needs an explicit low-credit queue");
    assert.ok(lowBalances.rows.every((row) => Number(row.credits) <= 3));
    assert.equal(overview.metrics.find((metric) => metric.label === "我的学生")?.value, 100);
    assert.equal(overview.metrics.find((metric) => metric.label === "全机构学生")?.value, 1000);
    assert.equal(students?.totalRows, 1000);
    assert.equal(students?.rows.length, 25);
    assert.equal(workloads?.rows.length, 10);
    assert.ok(workloads.rows.every((row) => Number(row.students) === 100));
  }
  if (role === "manager_admin") {
    assert.equal(overview.metrics.find((metric) => metric.label === "全机构学生")?.value, 1000);
    assert.equal(overview.metrics.find((metric) => metric.label === "运营管理员")?.value, 10);
    assert.equal(overview.metrics.find((metric) => metric.label === "在职老师")?.value, 20);
    assert.equal(overview.metrics.find((metric) => metric.label === "每周固定班")?.value, 60);
  }
}

const studentPageTwo = await call(
  "Operations pages through the 1,000-student directory",
  "/api/platform/overview?role=operations_admin&studentPage=2",
);
const pageTwoRows = studentPageTwo.sections.find((section) => section.id === "students")?.rows;
assert.equal(pageTwoRows?.length, 25);
assert.equal(studentPageTwo.sections.find((section) => section.id === "students")?.page, 2);

const studentSearch = await call(
  "Operations searches the organization student directory",
  "/api/platform/overview?role=operations_admin&studentQuery=student_scale_1000",
);
const searchSection = studentSearch.sections.find((section) => section.id === "students");
assert.equal(searchSection?.totalRows, 1);
assert.equal(searchSection?.rows[0]?.id, "student_scale_1000");

const escapedWildcard = await call(
  "Student search treats wildcard input literally",
  "/api/platform/overview?role=operations_admin&studentQuery=%25",
);
assert.equal(escapedWildcard.sections.find((section) => section.id === "students")?.totalRows, 0);

await call(
  "Student directory rejects an invalid page",
  "/api/platform/overview?role=operations_admin&studentPage=0",
  { expected: 400 },
);

await call(
  "Student directory rejects an oversized search",
  `/api/platform/overview?role=operations_admin&studentQuery=${"x".repeat(81)}`,
  { expected: 400 },
);

for (const role of ["teacher", "operations_admin", "manager_admin", "student", "guardian", "system_admin"]) {
  await call(`${role} page server render`, `/workspace/${role}`);
}

await call("Student cannot run admissions command", "/api/platform/commands?role=student", {
  method: "POST",
  body: {
    action: "create_inquiry",
    studentName: "Blocked Student",
    birthDate: "2015-01-01",
    guardianName: "Blocked Guardian",
    guardianEmail: "blocked@example.test",
    guardianPhone: "0400000000",
    source: "Attack",
    notes: "",
  },
  expected: 403,
});

await call("Cross-site browser write rejected", "/api/platform/commands?role=student", {
  method: "POST",
  body: {
    action: "create_order",
    studentId: "student_01",
    creditQuantity: 1,
    amountCents: 6000,
    description: "Blocked cross-site order",
  },
  expected: 403,
  headers: { origin: "https://evil.example.test" },
});

const mathSessionId = `session_y6_math_${today}`;
const englishSessionId = `session_y5_english_${today}`;
const feedback = await call("Teacher feedback has AI/fallback isolation", "/api/feedback/draft", {
  method: "POST",
  body: {
    sessionId: mathSessionId,
    rawNotes: "Students practised fractions and should review mixed numbers next lesson.",
  },
});
assert.ok(["ai", "fallback"].includes(feedback.source));

const mathCompletion = await completeSession(
  mathSessionId,
  "e2e_math_completion_20260917",
  "Fractions practice completed; review mixed numbers next lesson.",
);
assert.equal(mathCompletion.result.pendingCreditCount, 1);
const replay = await call("Teacher completion exact replay", `/api/sessions/${mathSessionId}/complete`, {
  method: "POST",
  body: mathCompletion.payload,
  headers: { "idempotency-key": "e2e_math_completion_20260917" },
});
assert.equal(replay.idempotentReplay, true);

const englishWorkspace = await call("Teacher loads English class", `/api/workspace?sessionId=${englishSessionId}`);
const englishPayload = {
  expectedVersion: englishWorkspace.selectedSession.version,
  records: englishWorkspace.roster.map((student) => ({ studentId: student.id, status: "present" })),
  rawClassNotes: "Reading comprehension and vocabulary review completed.",
  feedback: null,
};
await call("Attendance key cannot cross sessions", `/api/sessions/${englishSessionId}/complete`, {
  method: "POST",
  body: englishPayload,
  headers: { "idempotency-key": "e2e_math_completion_20260917" },
  expected: 409,
});
await call("Teacher completes second class", `/api/sessions/${englishSessionId}/complete`, {
  method: "POST",
  body: englishPayload,
  headers: { "idempotency-key": "e2e_english_completion_20260917" },
});
await call("Teacher cannot enumerate another teacher session", `/api/workspace?sessionId=session_other_teacher_${today}`, {
  expected: 404,
});

const exceptions = await call("Manager lists zero-credit exception", "/api/admin/billing-exceptions");
const zeroCredit = exceptions.items.find((item) => item.studentId === "student_05");
assert.ok(zeroCredit, "Expected student_05 billing exception");
await call("Manager waives audited zero-credit exception", `/api/admin/billing-exceptions/${zeroCredit.id}/resolve`, {
  method: "POST",
  body: { expectedVersion: zeroCredit.version, action: "waive", note: "Approved test waiver" },
  headers: { "idempotency-key": "e2e_billing_waiver_20260917" },
});

const firstInquiry = await command("Operations creates inquiry", "operations_admin", {
  action: "create_inquiry",
  studentName: "E2E Prospect One",
  birthDate: "2015-05-10",
  guardianName: "E2E Guardian One",
  guardianEmail: "e2e.guardian.one@example.test",
  guardianPhone: "0400000101",
  source: "E2E",
  notes: "End-to-end prospect",
});
const firstTrial = await command("Operations schedules trial", "operations_admin", {
  action: "schedule_trial",
  inquiryId: firstInquiry.entityId,
  teacherId: "staff_teacher_mei",
  date: tomorrow,
  startTime: "16:00",
  endTime: "17:00",
  room: "Room 3",
});
await command("Trial result cannot precede attendance", "operations_admin", {
  action: "record_trial_outcome",
  trialBookingId: firstTrial.entityId,
  outcome: "attended",
  decision: "enrol",
  notes: "Too early",
}, 409);

const secondInquiry = await command("Operations creates second inquiry", "operations_admin", {
  action: "create_inquiry",
  studentName: "E2E Prospect Two",
  birthDate: "2015-07-11",
  guardianName: "E2E Guardian Two",
  guardianEmail: "e2e.guardian.two@example.test",
  guardianPhone: "0400000102",
  source: "E2E",
  notes: "Conflict test prospect",
});
await command("Teacher overlap rejected", "operations_admin", {
  action: "schedule_trial",
  inquiryId: secondInquiry.entityId,
  teacherId: "staff_teacher_mei",
  date: tomorrow,
  startTime: "16:30",
  endTime: "17:30",
  room: "Room 2",
}, 409);

await command("Cancelled trial cannot directly enrol", "operations_admin", {
  action: "record_trial_outcome",
  trialBookingId: "trial_booking_seed",
  outcome: "cancelled",
  decision: "enrol",
  notes: "Invalid direct enrolment",
}, 422);

await command("Operations records completed trial outcome", "operations_admin", {
  action: "record_trial_outcome",
  trialBookingId: "trial_booking_completed_seed",
  outcome: "attended",
  decision: "enrol",
  notes: "Attended and suitable for enrolment",
});
const conversion = await command("Operations converts inquiry atomically", "operations_admin", {
  action: "convert_inquiry",
  inquiryId: "inquiry_completed_28",
  classSeriesId: "series_y5_english",
  creditQuantity: 8,
  amountCents: 48000,
});
assert.ok(conversion.details.orderId);
await command("Operations completes follow-up", "operations_admin", {
  action: "complete_follow_up",
  taskId: "followup_overdue_26",
  note: "Guardian contacted successfully",
});
await command("Operations prepares renewal for owned low-credit student", "operations_admin", {
  action: "create_order",
  studentId: "student_04",
  creditQuantity: 8,
  amountCents: 48000,
  description: "Eight lesson renewal prepared by operations",
});
await command("Operations cannot modify another owner's student", "operations_admin", {
  action: "create_order",
  studentId: "student_30",
  creditQuantity: 8,
  amountCents: 48000,
  description: "Forbidden cross-owner renewal",
}, 403);

const studentOrder = await command("Student creates own renewal", "student", {
  action: "create_order",
  studentId: "student_01",
  creditQuantity: 2,
  amountCents: 12000,
  description: "Two lesson renewal",
});
await command("Student cannot order for another student", "student", {
  action: "create_order",
  studentId: "student_02",
  creditQuantity: 2,
  amountCents: 12000,
  description: "Forbidden renewal",
}, 403);
const providerEventId = "e2e_provider_event_20260917";
await command("Student sandbox payment", "student", {
  action: "sandbox_pay_order",
  orderId: studentOrder.entityId,
  providerEventId,
});
const paymentReplay = await command("Payment callback replay", "student", {
  action: "sandbox_pay_order",
  orderId: studentOrder.entityId,
  providerEventId,
});
assert.equal(paymentReplay.idempotentReplay, true);
const secondStudentOrder = await command("Student creates another pending order", "student", {
  action: "create_order",
  studentId: "student_01",
  creditQuantity: 1,
  amountCents: 6000,
  description: "One lesson renewal",
});
await command("Provider event cannot move to another order", "student", {
  action: "sandbox_pay_order",
  orderId: secondStudentOrder.entityId,
  providerEventId,
}, 409);

const guardianSecondChild = await call(
  "Guardian switches to linked second child",
  "/api/platform/overview?role=guardian&studentId=student_02",
);
assert.equal(guardianSecondChild.context.studentId, "student_02");
await call("Guardian cannot inspect unrelated student", "/api/platform/overview?role=guardian&studentId=student_03", {
  expected: 403,
});
const guardianOrder = await command("Guardian orders for linked child", "guardian", {
  action: "create_order",
  studentId: "student_02",
  creditQuantity: 2,
  amountCents: 12000,
  description: "Guardian renewal",
});
await command("Guardian cannot order for unrelated child", "guardian", {
  action: "create_order",
  studentId: "student_03",
  creditQuantity: 2,
  amountCents: 12000,
  description: "Forbidden guardian renewal",
}, 403);
await command("Guardian pays linked child order", "guardian", {
  action: "sandbox_pay_order",
  orderId: guardianOrder.entityId,
  providerEventId: "e2e_guardian_payment_20260917",
});

const faqAnswer = await call("FAQ answers an approved basic question", "/api/faq/triage?role=student", {
  method: "POST",
  body: { question: "正式课出勤以后，课时怎么扣？", studentId: "student_01" },
});
assert.equal(faqAnswer.status, "answered");
assert.equal(faqAnswer.faqId, "faq_credit_charge");
const faqHandoff = await call("FAQ routes a refund dispute to the human owner", "/api/faq/triage?role=student", {
  method: "POST",
  body: { question: "我的余额不对，我想申请退费", studentId: "student_01" },
});
assert.equal(faqHandoff.status, "escalated");
assert.ok(faqHandoff.ticketId);
await call("Guardian FAQ cannot target an unrelated child", "/api/faq/triage?role=guardian", {
  method: "POST",
  body: { question: "课时怎么扣？", studentId: "student_03" },
  expected: 403,
});

const refund = await command("Operations requests full unused-credit refund", "operations_admin", {
  action: "request_refund",
  orderId: studentOrder.entityId,
  amountCents: 12000,
  reason: "Unused package requested by family",
});
await command("Manager approves refund with separation of duties", "manager_admin", {
  action: "approve_refund",
  refundId: refund.entityId,
  approve: true,
  note: "Unused credits verified",
});
await command("Refund cannot be approved twice", "manager_admin", {
  action: "approve_refund",
  refundId: refund.entityId,
  approve: true,
  note: "Duplicate approval",
}, 409);

await command("Manager updates allow-listed setting", "manager_admin", {
  action: "update_setting",
  key: "renewal.threshold",
  value: { credits: 3 },
});
await command("Manager cannot write arbitrary setting", "manager_admin", {
  action: "update_setting",
  key: "security.disableAllChecks",
  value: true,
}, 422);
await command("Manager approves payroll", "manager_admin", {
  action: "approve_payroll_period",
  payrollPeriodId: "payroll_current",
});
await command("Manager marks payroll paid", "manager_admin", {
  action: "mark_payroll_paid",
  payrollPeriodId: "payroll_current",
});
await command("Paid payroll cannot be paid again", "manager_admin", {
  action: "mark_payroll_paid",
  payrollPeriodId: "payroll_current",
}, 409);

await command("System admin cannot change business settings", "system_admin", {
  action: "update_setting",
  key: "renewal.threshold",
  value: { credits: 1 },
}, 403);
const support = await command("System admin requests scoped support", "system_admin", {
  action: "request_support_session",
  reason: "Investigate failed sandbox message delivery",
  scope: ["diagnostics.read", "jobs.retry", "business.masked_read"],
  minutes: 30,
});
await command("System admin cannot self-approve via manager role", "manager_admin", {
  action: "approve_support_session",
  supportSessionId: support.entityId,
  minutes: 30,
}, 409);
await command(
  "Independent manager approves scoped support",
  "manager_admin",
  {
    action: "approve_support_session",
    supportSessionId: support.entityId,
    minutes: 30,
  },
  200,
  independentManagerIdentity,
);
await command("Only one active support session is allowed", "system_admin", {
  action: "request_support_session",
  reason: "Duplicate support request",
  scope: ["diagnostics.read"],
  minutes: 15,
}, 409);
const outbox = await command("System admin processes sandbox outbox", "system_admin", {
  action: "process_outbox",
  limit: 100,
});
assert.ok(outbox.details.processed >= 1);
const emptyOutbox = await command("Outbox worker replay is safe", "system_admin", {
  action: "process_outbox",
  limit: 100,
});
assert.equal(emptyOutbox.details.processed, 0);

for (const role of ["operations_admin", "manager_admin", "student", "guardian", "system_admin"]) {
  const overview = await call(`${role} overview remains healthy after mutations`, `/api/platform/overview?role=${role}`);
  if (role === "operations_admin") {
    const tasks = overview.sections.find((section) => section.id === "tasks")?.rows ?? [];
    const handoffTask = tasks.find((row) => row.id === faqHandoff.ticketId);
    assert.ok(handoffTask, "FAQ handoff must reach the owner task queue");
    assert.match(String(handoffTask.question), /退费/);
  }
}
await call("Teacher workspace remains healthy after mutations", "/api/workspace");

console.log(`E2E PASS: ${checks.length} HTTP role/business checks`);
for (const check of checks) console.log(`  ${check.status}  ${check.label}`);
