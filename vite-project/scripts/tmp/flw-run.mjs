process.env.FLW_SECRET_KEY = "FLWSECK_TEST-fake-for-local-run";
const mod = await import("../../server/flutterwave.js");

const realFetch = globalThis.fetch;
let seen = [];
globalThis.fetch = async (url, init) => {
  seen.push({ url, method: init.method, body: init.body && JSON.parse(init.body), auth: init.headers.Authorization.startsWith("Bearer FLWSECK_TEST-") });
  const u = new URL(url);
  if (u.pathname.endsWith("/virtual-account-numbers") && init.method === "POST") {
    return new Response(JSON.stringify({ status: "success", message: "Virtual account created", data: {
      response_code: "02", flw_ref: "NDKZ8600178111021323728832", order_ref: "URF_1781110210729_7253035",
      account_number: "9587478607", bank_name: "Flutterwave MFB", account_status: "ACTIVE",
      note: "Please make a bank transfer to Jane Doe FLW", amount: "0.00" } }), { status: 200 });
  }
  if (u.pathname.endsWith("/virtual-account-numbers") && u.searchParams.get("order_ref") === "URF_GONE") {
    return new Response(JSON.stringify({ status: "error", message: "Virtual account not found" }), { status: 404 });
  }
  if (u.pathname.endsWith("/virtual-account-numbers")) {
    return new Response(JSON.stringify({ status: "success", message: "Virtual account fetched", data: {
      order_ref: u.searchParams.get("order_ref"), account_number: "9587478607", bank_name: "Flutterwave MFB",
      account_status: "active", note: "Please make a bank transfer to Jane Doe FLW", amount: "0.00" } }), { status: 200 });
  }
  if (u.pathname.includes("/transactions/") && u.pathname.endsWith("/verify")) {
    return new Response(JSON.stringify({ status: "success", message: "Transaction fetched successfully", data: {
      id: 2028146660, status: "successful", amount: 100, currency: "NGN", tx_ref: "order_1", flw_ref: "10000...",
      payment_type: "bank_transfer", processor_response: "success", created_at: "2026-04-20T10:34:22.000Z",
      customer: { name: "Jane Doe", email: "Jane@Example.com" } } }), { status: 200 });
  }
  return new Response("{}", { status: 500 });
};

const errors = [];
function check(label, ok, extra = "") { console.log((ok ? "PASS " : "FAIL ") + label + (extra ? "  " + extra : "")); if (!ok) errors.push(label); }

const created = await mod.createPermanentVirtualAccount({
  email: "jane@example.com", firstname: "Jane", lastname: "Doe", identity: { bvn: "12345678901" },
  txRef: "PN-jane-account-ref",
});
check("create: account number", created.accountNumber === "9587478607");
check("create: accountStatus from account_status", created.accountStatus === "ACTIVE");
check("create: narration from note", created.narration === "Please make a bank transfer to Jane Doe FLW");
check("create: amountLimit null for 0.00", created.amountLimit === null);
check("create: orderRef", created.orderRef === "URF_1781110210729_7253035");
check("create: txRef is sent to Flutterwave", created.txRef === "PN-jane-account-ref");
const postBody = seen.find(s => s.method === "POST").body;
check("create: body has is_permanent+bvn+tx_ref, no nin", postBody.is_permanent === true && postBody.bvn === "12345678901" && postBody.tx_ref === "PN-jane-account-ref" && !("nin" in postBody));

try { await mod.createPermanentVirtualAccount({ email: "a@b.c", firstname: "A", lastname: "B", txRef: "PN-invalid-ref", identity: {} }); check("create: rejects no identity", false); }
catch (e) { check("create: rejects no identity", e.code === "IDENTITY_REQUIRED" && e.status === 400); }

const lookup = await mod.findVirtualAccounts({ orderRefs: ["URF_1781110210729_7253035"] });
check("lookup: found by order_ref", lookup.accounts.length === 1 && lookup.authoritative === true);
check("lookup: uses order_ref param", seen.some(s => s.url.includes("order_ref=URF_1781110210729") && !s.url.includes("email=")));
const gone = await mod.findVirtualAccounts({ orderRefs: ["URF_GONE"] });
check("lookup: 404 => no accounts, authoritative", gone.accounts.length === 0 && gone.authoritative === true);
const none = await mod.findVirtualAccounts({ orderRefs: [] });
check("lookup: no refs => no call, not authoritative", none.accounts.length === 0 && none.authoritative === false);

const verified = await mod.verifyTransaction(2028146660);
check("verify: status/amount/currency", verified.status === "successful" && verified.amount === 100 && verified.currency === "NGN");
check("verify: email lowercased", verified.customerEmail === "jane@example.com");

check("extract: meta_data beneficiary", mod.extractVirtualAccountNumber({ meta_data: { account_number: "9587478607" } }) === "9587478607");
check("extract: unknown returns null", mod.extractVirtualAccountNumber({}) === null);
check("config: test mode", mod.isTestKey() === true && mod.describeConfig().mode === "test");

try { await mod.verifyTransaction("abc"); check("verify: rejects bad id", false); }
catch (e) { check("verify: rejects bad id", e.code === "INVALID_TRANSACTION_ID"); }

globalThis.fetch = realFetch;
console.log(errors.length ? `\n${errors.length} FAILED` : "\nALL PASSED");
process.exit(errors.length ? 1 : 0);
