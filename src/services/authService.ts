/**
 * ADMIN AUTHENTICATION SERVICE (FRONTEND DEMO LAYER)
 * 
 * IMPORTANT:
 * In this frontend-only phase, this service manages in-memory authentication state
 * for testing the Admin Dashboard interface.
 * 
 * In the production Cloudflare deployment phase:
 * - This will be replaced by a secure HTTP-only cookie session or JWT issued by Cloudflare Workers.
 * - Server-side authorization checks will protect all product mutations and order queries.
 * - Hiding routes or buttons is NOT treated as security.
 */

export interface AdminUser {
  email: string;
  name: string;
  role: "admin";
  isDemoSession: boolean;
}

class AuthService {
  private currentAdmin: AdminUser | null = null;
  private listeners: ((user: AdminUser | null) => void)[] = [];

  constructor() {
    // Check if demo admin session was set previously in current session
    const saved = sessionStorage.getItem("alankritha_demo_admin");
    if (saved) {
      try {
        this.currentAdmin = JSON.parse(saved);
      } catch {
        this.currentAdmin = null;
      }
    }
  }

  public isAuthenticated(): boolean {
    return this.currentAdmin !== null;
  }

  public getCurrentUser(): AdminUser | null {
    return this.currentAdmin;
  }

  /**
   * Demo Login Simulation:
   * Accepts any valid email and non-empty password during frontend testing.
   * Does not hardcode a single secret password or pretend to be cryptographic security.
   */
  public async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    // Basic validation
    if (!email.trim() || !email.includes("@")) {
      return { success: false, error: "Please provide a valid administrative email address." };
    }

    if (!password || password.trim().length < 4) {
      return { success: false, error: "Password must be at least 4 characters long." };
    }

    // Simulate brief network latency for realistic feel
    await new Promise(resolve => setTimeout(resolve, 500));

    const demoUser: AdminUser = {
      email: email.trim(),
      name: email.split("@")[0].toUpperCase(),
      role: "admin",
      isDemoSession: true
    };

    this.currentAdmin = demoUser;
    sessionStorage.setItem("alankritha_demo_admin", JSON.stringify(demoUser));
    this.notify();

    return { success: true };
  }

  /**
   * Fast-track demo login for review & evaluation
   */
  public loginDemo(): void {
    const demoUser: AdminUser = {
      email: "owner@alankritha.com",
      name: "Boutique Owner",
      role: "admin",
      isDemoSession: true
    };
    this.currentAdmin = demoUser;
    sessionStorage.setItem("alankritha_demo_admin", JSON.stringify(demoUser));
    this.notify();
  }

  public logout(): void {
    this.currentAdmin = null;
    sessionStorage.removeItem("alankritha_demo_admin");
    this.notify();
  }

  public subscribe(listener: (user: AdminUser | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l(this.currentAdmin));
  }
}

export const authService = new AuthService();
