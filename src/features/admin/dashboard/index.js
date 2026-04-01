import { loadAppConfig } from '../../../config/app-config.js';
import { AdminDashboardApp } from './admin-dashboard-app.js';

function bootstrapAdmin() {
  const config = loadAppConfig();
  const app = new AdminDashboardApp(config);
  app.init();
}

bootstrapAdmin();
