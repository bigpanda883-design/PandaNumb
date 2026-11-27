// Throwaway end-to-end check of the new admin endpoints. Deleted after the run.
const BASE = "http://localhost:8799";

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { unparsed: true };
  }
  return { status: res.status, json };
}

const password = "Panda#Test1";
const stamp = Date.now();

function report(name, result, extra = "") {
  const ok = result.status < 400;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name} -> ${result.status}${extra ? ` ${extra}` : ""}`,
  );
  if (!ok) console.log("   ", JSON.stringify(result.json).slice(0, 400));
  return result;
}

(async () => {
  const adminEmail = `admin${stamp}@panda.test`;
  const customerEmail = `cust${stamp}@panda.test`;

  // 1. Admin account (first admin can self-register via the setup endpoint).
  let r = await call("/api/auth/admin/register", {
    method: "POST",
    body: {
      fullName: "Test Admin",
      email: adminEmail,
      phone: `08012${stamp.toString().slice(-6)}9`,
      password,
    },
  });
  report("create admin", r);
  const adminToken = r.json?.token;

  // 2. Two customers so presence counts are real.
  const customers = [];
  for (const suffix of ["a", "b"]) {
    r = await call("/api/auth/signup", {
      method: "POST",
      body: {
        fullName: `Customer ${suffix}`,
        email: `cust-${suffix}-${stamp}@panda.test`,
        phone: `08099${stamp.toString().slice(-6)}${suffix === "a" ? 1 : 2}`,
        password,
      },
    });
    report(`signup customer ${suffix}`, r);
    customers.push(r.json);
  }
  const customerToken = customers[0]?.token;

  // 3. Presence: only the signed-in session counts.
  r = await call("/api/admin/presence", { token: adminToken });
  report("admin presence", r, JSON.stringify(r.json));

  r = await call("/api/presence/heartbeat", {
    method: "POST",
    token: customerToken,
  });
  report("customer heartbeat", r);

  r = await call("/api/admin/users?presence=online", { token: adminToken });
  report("users online filter", r, `total=${r.json?.total}`);
  const onlineIds = (r.json?.items || []).map((u) => u.id);
  console.log(
    "    online user has lastSeenAt:",
    r.json?.items?.[0]?.lastSeenAt,
  );
  if (!onlineIds.includes(customers[0]?.user?.id)) {
    console.log("FAIL customer A should be online");
  } else {
    console.log("PASS customer A appears online");
  }

  r = await call("/api/admin/users?presence=offline", { token: adminToken });
  report("users offline filter", r, `total=${r.json?.total}`);
  if (onlineIds.includes(customers[1]?.user?.id)) {
    console.log("FAIL customer B (never signed in) appears online");
  } else {
    console.log("PASS customer B is offline");
  }

  // 4. Inventory - pick an offer that is actually in stock so the Buy page
  // will list it.
  r = await call("/api/admin/inventory?limit=100", { token: adminToken });
  report(
    "inventory list",
    r,
    `total=${r.json?.total} stats=${JSON.stringify(r.json?.stats)}`,
  );
  const offer = (r.json?.items || []).find(
    (item) => item.stock > 0 && item.sellable,
  );
  console.log("    in-stock offer:", JSON.stringify(offer));

  if (offer) {
    r = await call("/api/admin/inventory/price", {
      method: "PUT",
      token: adminToken,
      body: {
        countrySlug: offer.countrySlug,
        cardId: offer.cardId,
        variantId: offer.variantId,
        price: Math.ceil(offer.providerCost) + 500,
      },
    });
    report("set selling price", r, JSON.stringify(r.json?.offer));

    // The Buy catalogue must now carry the operator's price.
    const prices = await call("/api/prices");
    const cat =
      prices.json?.countries?.[offer.countrySlug]?.[offer.cardId]?.[
        offer.variantId
      ];
    const expected = Math.ceil(offer.providerCost) + 500;
    if (cat && Number(cat.price) === expected) {
      console.log(
        `PASS buy catalogue uses new price ₦${cat.price} (cost ₦${cat.cost})`,
      );
    } else {
      console.log(
        `FAIL buy catalogue price ${JSON.stringify(cat)} != ${expected}`,
      );
    }

    // Disabling the service must remove it from the Buy page.
    r = await call("/api/admin/inventory/service", {
      method: "PUT",
      token: adminToken,
      body: { cardId: offer.cardId, sellable: false },
    });
    report("disable service", r);
    const afterDisable = await call("/api/prices");
    const disabledEntry =
      afterDisable.json?.countries?.[offer.countrySlug]?.[offer.cardId]?.[
        offer.variantId
      ];
    console.log(
      disabledEntry && disabledEntry.price === null
        ? "PASS disabled service is not buyable on the Buy page"
        : `FAIL disabled service still priced: ${JSON.stringify(disabledEntry)}`,
    );

    r = await call("/api/admin/inventory/service", {
      method: "PUT",
      token: adminToken,
      body: { cardId: offer.cardId, sellable: true },
    });
    report("re-enable service", r);
  }

  // 5. Announcements
  r = await call("/api/admin/announcements/audience", { token: adminToken });
  report("audience counts", r, JSON.stringify(r.json?.all));

  r = await call("/api/admin/announcements", {
    method: "POST",
    token: adminToken,
    body: {
      title: "Important Panda Number Update",
      body: "Welcome to Panda Number! We have made improvements to our platform.",
      audience: "all",
      send: true,
    },
  });
  report("send announcement", r, JSON.stringify(r.json?.delivery));

  const announcementId = r.json?.announcement?.id;

  // Retry the same announcement -> no duplicate notifications.
  r = await call("/api/admin/announcements", {
    method: "POST",
    token: adminToken,
    body: { title: "Dup test", body: "dup", audience: "all", send: true },
  });

  // 6. Customer notifications
  r = await call("/api/notifications", { token: customerToken });
  report(
    "customer notifications",
    r,
    `count=${r.json?.items?.length} unread=${r.json?.unreadCount}`,
  );
  const note = r.json?.items?.[0];
  if (note) console.log("    top notification:", note.title);

  if (note) {
    r = await call(`/api/notifications/${note.id}/read`, {
      method: "POST",
      token: customerToken,
    });
    report("mark read", r, `unread=${r.json?.unreadCount}`);
  }

  // 7. Activity log
  r = await call("/api/admin/activity-logs?limit=5", { token: adminToken });
  report(
    "activity logs",
    r,
    `total=${r.json?.total} stats=${JSON.stringify(r.json?.stats)}`,
  );
  console.log(
    "    actions:",
    (r.json?.items || []).map((i) => i.action).join(", "),
  );

  // 8. Settings
  r = await call("/api/admin/settings", { token: adminToken });
  report(
    "settings",
    r,
    `sessions=${r.json?.sessions?.length} dbConnected=${r.json?.system?.database?.connected} providerReady=${r.json?.system?.inventoryProvider?.ready}`,
  );

  r = await call("/api/admin/settings/preferences", {
    method: "PUT",
    token: adminToken,
    body: { theme: "dark", tableDensity: "compact", interfaceScale: 110 },
  });
  report("save preferences", r, JSON.stringify(r.json?.preferences));

  r = await call("/api/admin/settings", { token: adminToken });
  console.log(
    "    persisted theme:",
    r.json?.preferences?.theme,
    "density:",
    r.json?.preferences?.tableDensity,
  );

  r = await call("/api/admin/settings/profile", {
    method: "PUT",
    token: adminToken,
    body: { fullName: "Test Admin Renamed", phone: "" },
  });
  report("save profile", r, r.json?.profile?.fullName);

  // 9. Non-admin must be refused.
  r = await call("/api/admin/presence", { token: customerToken });
  report(
    "customer blocked from admin",
    { status: r.status === 403 ? 200 : 500, json: r.json },
    r.json?.error,
  );

  console.log("\nannouncement id:", announcementId);
})().catch((error) => {
  console.error("CRASH", error);
  process.exit(1);
});
