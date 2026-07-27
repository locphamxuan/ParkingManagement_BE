# PBMS — Notes for project defense

## 1. Role boundaries

| Role | Core responsibility | Must not do |
| --- | --- | --- |
| Admin | Own the system: buildings, account/role assignment, global revenue, reconciliation and audit | Gate check-in/out or cash confirmation |
| Manager | Operate assigned buildings: parking configuration, pricing, shifts, incidents and cash confirmation | Change global roles or other buildings |
| Staff | Perform the assigned shift: admit/release vehicles and record evidence | Configure prices, manage wallets or alter audit data |
| User | Register vehicles, buy packages, pay and view personal history | Operate gates or change parking configuration |

The implementation enforces building scope for staff/manager actions. A staff member also needs an active shift; if that shift has a gate, entry and exit must use that same active gate.

## 2. Realistic check-in rules

- A car selects both zone and slot. A motorcycle selects only a zone; the server atomically allocates an available compatible slot in that zone.
- Check-in requires a normalized plate, plate photograph and driver portrait. The frontend prevents submission before both images are present and the backend validates image type and size again.
- A registered plate may have only one owner. Existing ambiguous records are rejected at check-in and must be fixed by an administrator instead of choosing an arbitrary owner.
- Vehicle type must match the registered plate. A forced override requires a reason and is kept in audit metadata.
- An entry gate must be active, belong to the building and allow entry. For a staff shift assigned to a gate, another gate is forbidden.

## 3. Revenue recognition

`Payment` is the source of revenue; a `ParkingSession` is operational evidence, not revenue by itself.

1. Electronic or wallet payment is successful when the provider/wallet operation succeeds. It is credited to the building wallet in the same transaction.
2. Cash payment is created as `pending`. It is **not** credited as revenue until a manager confirms the physical cash collection.
3. The same pending-cash rule applies to long-term-package overage. This prevents an overstated building balance.
4. Reporting recognizes settled/successful payments and keeps pending, failed, refunded and reconciliation-required payments separate.
5. The PayOS order code has a database-level unique partial index to make duplicate webhook processing idempotent.

## 4. Audit and retention

- Buildings are archived (`inactive`, `isActive=false`), never physically deleted, so sessions, payments and configuration history remain explainable.
- An account with operational, payment, wallet, subscription or notification history cannot be deleted. It should be locked instead.
- Audit snapshots redact stored image evidence and tokens, preventing the same biometric image from being duplicated in `AuditLog`.
- Evidence remains on the parking session for entry/exit comparison, where it is needed operationally.

## 5. Kiosk security

The kiosk endpoint is not a general public browser endpoint. The installed device must send `x-kiosk-device-token`, is rate-limited, and must identify an active entry gate. The device secret is configured as `KIOSK_DEVICE_TOKEN` on the server/device only and must never be put into web or mobile source code.

A vehicle QR identifies the registered vehicle; it does not replace physical observation. The gate device/channel, camera evidence and duplicate-active-session rule are the controls around QR scanning.

## 6. Deliberate limits to state honestly

- The current design is single-tenant: one deployed PBMS instance represents one system owner. A SaaS product serving several independent buyers needs an `Organization/Tenant` boundary on every business record.
- Existing live data must be cleaned through a reviewed migration, not by deleting records from the application. The business audit command detects duplicate plate ownership and orphaned references.
- A production deployment must configure OCR, SMTP, PayOS, `KIOSK_DEVICE_TOKEN`, frontend `VITE_API_BASE`, and mobile `EXPO_PUBLIC_API_BASE_URL`; production deliberately does not fall back to localhost.
