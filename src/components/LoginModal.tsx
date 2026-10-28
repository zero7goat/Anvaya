import { useEffect, useRef, useState, FormEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MOTION_TRANSITION, OVERLAY_MOTION } from "../utils/motion";
import { BOUTIQUE_CONFIG } from "../config";
import { FloralSprig } from "./decor/Motifs";
import { X, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, LogIn, UserPlus } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminLoginSuccess: () => void;
  onClientLoginSuccess: (username: string) => void;
  // Site footer, shown below the sign-in area
  footer?: ReactNode;
}

/**
 * Customer sign-in / sign-up. A full-screen, centred single-column view: brand mark
 * at the top, then the form, then the switch to the other view, with floral sprigs at
 * the page edges, a scalloped border along the bottom, then the site footer.
 *
 * Front-end demo only: no account is stored or verified. Admin sign-in is separate
 * and lives on the admin dashboard.
 */
export default function LoginModal({
  isOpen,
  onClose,
  onClientLoginSuccess,
  footer,
}: LoginModalProps) {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Focus the first field on open, close on Escape, and return focus to the trigger on close
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => usernameRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    setErrorMsg("");
    setSuccessMsg("");
    setShowPassword(false);
  };

  // After switching views the form re-mounts, so focus its first field once it exists
  useEffect(() => {
    if (isOpen) usernameRef.current?.focus({ preventScroll: true });
  }, [isSignUp]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setIsLoading(true);

    // Simulate small delay for editorial premium feel
    setTimeout(() => {
      setIsLoading(false);

      // Customer login simulation
      if (isSignUp) {
        setSuccessMsg(`Welcome to the Alankritha Family! Account created for ${username}.`);
      } else {
        setSuccessMsg(`Namaste ${username}! Welcome back to your Alankritha wardrobe.`);
      }
      setTimeout(() => {
        onClientLoginSuccess(username);
        onClose();
        setUsername("");
        setPassword("");
        setEmail("");
        setShowPassword(false);
        setSuccessMsg("");
      }, 1000);
    }, 600);
  };

  const isBusy = isLoading || !!successMsg;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="login-modal"
          {...OVERLAY_MOTION.backdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-title"
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-canvas font-sans"
          id="login-modal-root"
        >
          <button
            onClick={onClose}
            className="btn-icon fixed top-3 right-3 sm:top-5 sm:right-5 z-10"
            aria-label="Close sign in"
            id="close-login-btn"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Sign-in area fills the first screen; the site footer follows below it */}
          <div className="min-h-full flex flex-col items-center">
           <div className="relative w-full flex-1 flex flex-col items-center min-h-[100svh]">
            {/* Floral sprigs at the page edges (decorative; smaller and fainter on phones) */}
            <FloralSprig className="absolute left-0 top-28 md:top-1/2 md:-translate-y-1/2 h-48 md:h-[26rem] lg:h-[30rem] w-auto text-line-strong opacity-50 md:opacity-100" />
            <FloralSprig className="absolute right-0 bottom-20 md:bottom-auto md:top-1/2 md:-translate-y-1/2 h-48 md:h-[26rem] lg:h-[30rem] w-auto text-line-strong -scale-x-100 opacity-50 md:opacity-100" />

            {/* Brand mark */}
            <div className="flex flex-col items-center gap-2 pt-8 sm:pt-10 px-4" aria-hidden="true">
              <img src="/images/Logo.png" alt="" className="h-11 sm:h-12 w-auto object-contain" decoding="async" />
              <span className="font-serif text-base tracking-[0.3em] text-ink uppercase">
                {BOUTIQUE_CONFIG.brandName}
              </span>
            </div>

            {/* Form column, vertically centred in the remaining space */}
            <motion.div
              {...OVERLAY_MOTION.dialog}
              className="relative w-full max-w-[450px] flex-1 flex flex-col justify-center px-4 pt-10 pb-20"
              id="login-card"
            >
              <motion.div
                key={isSignUp ? "sign-up" : "sign-in"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITION.fast }}
              >
                <h2 id="login-title" className="font-serif text-3xl sm:text-[2rem] text-ink text-center">
                  {isSignUp ? "Create an Account" : "Login With Username"}
                </h2>
                <p className="text-base text-ink/85 mt-3 text-center">
                  {isSignUp ? "Create your wardrobe account" : "Please enter your username and password"}
                </p>

                <form onSubmit={handleSubmit} className="mt-7 space-y-3" id="login-form">
                  {errorMsg && (
                    <div className="status-note status-note-danger" role="alert" id="login-error-box">
                      <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {/* Username */}
                  <LabelledBox label="Username or Email" htmlFor="login-username-input">
                    <input
                      ref={usernameRef}
                      type="text"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={isSignUp ? "Choose username" : "Enter username"}
                      className={BOX_INPUT}
                      id="login-username-input"
                      disabled={isBusy}
                    />
                  </LabelledBox>

                  {/* Email (sign up only) */}
                  {isSignUp && (
                    <LabelledBox label="Email Address" htmlFor="login-email-input">
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className={BOX_INPUT}
                        id="login-email-input"
                        disabled={isBusy}
                      />
                    </LabelledBox>
                  )}

                  {/* Password, with a show/hide toggle */}
                  <LabelledBox
                    label="Password"
                    htmlFor="login-password-input"
                    action={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        aria-controls="login-password-input"
                        className="btn-icon btn-icon-sm rounded-xs"
                        id="login-password-toggle"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  >
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignUp ? "Create passcode" : "Enter password"}
                      className={BOX_INPUT}
                      id="login-password-input"
                      disabled={isBusy}
                    />
                  </LabelledBox>

                  <button
                    type="submit"
                    disabled={isBusy}
                    aria-busy={isLoading}
                    className="w-full !mt-4 h-16 flex items-center justify-center gap-2 bg-maroon-600 text-white text-base font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-maroon-700 disabled:opacity-70 cursor-pointer disabled:cursor-default"
                    id="login-submit-btn"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>Authenticating...</span>
                      </>
                    ) : successMsg ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>Signed in</span>
                      </>
                    ) : (
                      <span>{isSignUp ? "Register" : "Sign In"}</span>
                    )}
                  </button>

                  {successMsg && (
                    <div className="status-note status-note-success" role="status" id="login-success-box">
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}
                </form>

                <p className="mt-4 text-center text-sm font-semibold text-ink/70" id="login-demo-note">
                  Demo sign-in: nothing is stored or verified, and you stay signed in only until the page is reloaded.
                </p>

                {/* Switch between sign in and sign up */}
                <div
                  className="flex items-center gap-4 mt-9 mb-4 sm:-mx-5 text-sm uppercase tracking-[0.14em] text-muted"
                  aria-hidden="true"
                >
                  <span className="h-px flex-1 bg-line-strong" />
                  {isSignUp ? "Have an account?" : "New to Anvaya?"}
                  <span className="h-px flex-1 bg-line-strong" />
                </div>
                <button
                  type="button"
                  onClick={switchMode}
                  disabled={isBusy}
                  className="w-full h-[60px] flex items-center justify-center gap-3 border border-line-strong text-ink text-base transition-colors hover:bg-surface-muted hover:border-ink disabled:opacity-60 cursor-pointer disabled:cursor-default"
                  id="login-switch-btn"
                >
                  {isSignUp ? (
                    <LogIn className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                  )}
                  {isSignUp ? "Sign in instead" : "Create an account"}
                </button>
              </motion.div>
            </motion.div>

            {/* Scalloped dome border along the bottom of the sign-in area */}
            <svg className="absolute bottom-0 left-0 w-full h-9 text-maroon-700" aria-hidden="true">
              <defs>
                <pattern id="login-domes" width="44" height="36" patternUnits="userSpaceOnUse">
                  <path d="M0 36 C8 36 9 26 15 21 C19 18 21 13 22 6 C23 13 25 18 29 21 C35 26 36 36 44 36 Z" fill="currentColor" />
                  <circle cx="22" cy="4" r="2" className="fill-gold-500" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#login-domes)" />
            </svg>
           </div>

            {footer && <div className="w-full">{footer}</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BOX_INPUT =
  "w-full bg-transparent text-lg text-ink placeholder:text-muted/50 outline-none py-0.5 disabled:opacity-60";

/** White input box with its label inside, above the value. */
function LabelledBox({
  label,
  htmlFor,
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 bg-surface border border-transparent px-5 py-2.5 transition-colors focus-within:border-maroon-700">
      <div className="flex-1 min-w-0">
        <label htmlFor={htmlFor} className="block text-xs text-muted">
          {label}
        </label>
        {children}
      </div>
      {action}
    </div>
  );
}

