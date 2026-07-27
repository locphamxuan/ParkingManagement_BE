/**
 * Standard responsibility matrix shared across every UI surface.
 */
const getRoleCatalog = () => ({
  operatingModel: {
    admin: 'System owner or the organization that purchased and administers PBMS.',
    manager: 'Operates the parking buildings assigned by Admin.',
    staff: 'Gate/security staff working assigned shifts.',
    user: 'Customer using the parking service.',
  },
  roles: [
    {
      role: 'admin',
      purpose: 'Owns, administers and oversees the entire PBMS platform.',
      capabilities: [
        'Create, activate, suspend and decommission parking buildings',
        'Manage accounts and assign Manager/Staff to each building',
        'View gross revenue, refunds, net revenue and pending cash confirmations',
        'Look up all Payments and anomalies that need reconciliation',
        'Review audit logs, security events and operational health',
        'View the configuration of every building system-wide',
      ],
      boundaries: [
        'Does not check vehicles in/out at the gate directly',
        'Does not confirm cash on behalf of a building Manager',
        'Does not change day-to-day operating configuration via Manager permissions',
      ],
    },
    {
      role: 'manager',
      purpose: 'Operates and is financially accountable for the assigned buildings.',
      capabilities: [
        'Configure floors, zones, slots, gates, pricing, packages and policies',
        'Schedule Staff shifts and track vehicles currently parked',
        'Confirm cash handed over by Staff',
        'Track building wallet, revenue, refunds, penalty fees and incidents',
      ],
      boundaries: [
        'Only accesses buildings assigned by Admin',
        'Cannot create Admins or administer another Manager\'s buildings',
        'Cannot edit the system audit history',
      ],
    },
    {
      role: 'staff',
      purpose: 'Handles gate entry/exit and on-site security during shifts.',
      capabilities: [
        'Check vehicles in and out at the assigned gate',
        'Collect or record the customer\'s payment method',
        'View currently parked vehicles and their own shift history',
        'Report and handle incidents within their granted scope',
      ],
      boundaries: [
        'Does not configure pricing, buildings or staff assignments',
        'Cannot self-confirm cash they collected',
        'Cannot view system-wide financial data',
      ],
    },
    {
      role: 'user',
      purpose: 'Uses the service and manages their own parking activity.',
      capabilities: [
        'Manage vehicles and personal wallet',
        'Purchase long-term packages and reservations',
        'View parking history, payments, refunds and notifications',
        'Submit reviews and report incidents',
      ],
      boundaries: [
        'Only accesses their own data',
        'Cannot access internal operations or other users\' data',
      ],
    },
  ],
  separationOfDuties: [
    {
      flow: 'Cash parking fee collection',
      staff: 'Collects cash and records it at check-out',
      manager: 'Confirms the cash handed over at the building',
      admin: 'Monitors pending amounts and system-wide anomalies',
    },
    {
      flow: 'Electronic payment',
      staff: 'Initiates or verifies payment at the gate',
      manager: 'Tracks funds credited to the building wallet',
      admin: 'Reconciles stuck or exception-status transactions',
    },
    {
      flow: 'Refund',
      manager: 'Approves operational refunds per the building policy',
      admin: 'Reviews refund rates and their impact on net revenue',
    },
  ],
});

module.exports = { getRoleCatalog };
