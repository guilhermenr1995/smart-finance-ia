const { openFinanceProxy } = require('./src/handlers/open-finance-proxy');
const { categorizeTransactions } = require('./src/handlers/categorize-transactions');
const { analyzeSpendingInsights } = require('./src/handlers/analyze-spending-insights');
const { getAdminDashboard } = require('./src/handlers/get-admin-dashboard');
const { maintenanceDeduplicateTransactions } = require('./src/handlers/maintenance-deduplicate-transactions');
const { maintenanceResetUserJourney } = require('./src/handlers/maintenance-reset-user-journey');

exports.openFinanceProxy = openFinanceProxy;
exports.categorizeTransactions = categorizeTransactions;
exports.analyzeSpendingInsights = analyzeSpendingInsights;
exports.getAdminDashboard = getAdminDashboard;
exports.maintenanceDeduplicateTransactions = maintenanceDeduplicateTransactions;
exports.maintenanceResetUserJourney = maintenanceResetUserJourney;
