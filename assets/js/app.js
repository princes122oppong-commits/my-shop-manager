import { checkAuth } from './config/routes.js';
import { authService } from './services/authService.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize auth service (pre-seeds default users)
    authService.init();

    // Check authentication
    checkAuth();

    console.log('JoeTech Store Manager initialized successfully.');
});
