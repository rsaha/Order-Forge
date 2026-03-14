import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

interface SerializedUser {
  id: string;
}

interface AuthenticatedRequest {
  user?: { claims: { sub: string } };
  session: session.Session & {
    userId?: string;
    phoneAuth?: boolean;
  };
}

const isDev = process.env.NODE_ENV !== "production";
let devAdminUserId: string | null = null;

async function getDevAdminUserId(): Promise<string> {
  if (devAdminUserId) return devAdminUserId;
  const allUsers = await storage.getAllUsers();
  const admin = allUsers.find(u => u.isAdmin && u.role === "Admin");
  if (admin) {
    devAdminUserId = admin.id;
    return admin.id;
  }
  await storage.upsertUser({
    id: "dev-admin",
    email: "dev@admin.local",
    firstName: "Dev",
    lastName: "Admin",
    profileImageUrl: null,
    isAdmin: true,
  });
  devAdminUserId = "dev-admin";
  return "dev-admin";
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

const ADMIN_EMAILS = [
  "rakesh.x.saha@gmail.com",
  "xmaplepharma@gmail.com",
  "elmericbio@gmail.com",
];

async function upsertGoogleUser(profile: Profile): Promise<string> {
  const email = profile.emails?.[0]?.value?.toLowerCase() || "";
  const isAdmin = ADMIN_EMAILS.includes(email);
  const firstName = profile.name?.givenName || profile.displayName || null;
  const lastName = profile.name?.familyName || null;
  const profileImageUrl = profile.photos?.[0]?.value || null;

  const existingUser = email ? await storage.getUserByEmail(email) : null;

  if (existingUser) {
    const user = await storage.upsertUser({
      id: existingUser.id,
      email: email || null,
      firstName: firstName || existingUser.firstName,
      lastName: lastName || existingUser.lastName,
      profileImageUrl: profileImageUrl || existingUser.profileImageUrl,
      isAdmin: isAdmin || existingUser.isAdmin,
    });
    return user.id;
  }

  const user = await storage.upsertUser({
    id: profile.id,
    email: email || null,
    firstName,
    lastName,
    profileImageUrl,
    isAdmin,
  });
  return user.id;
}

export async function setupAuth(app: Express) {
  if (isDev) {
    console.log("[DEV MODE] Auth bypass enabled - auto-login as admin user");
    app.get("/api/login", (_req, res) => res.redirect("/"));
    app.get("/api/callback", (_req, res) => res.redirect("/"));
    app.get("/api/logout", (_req, res) => res.redirect("/"));
    return;
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Google OAuth");
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set for session management");
  }

  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => {
    cb(null, user as SerializedUser);
  });
  passport.deserializeUser((serialized: SerializedUser, cb) => {
    cb(null, serialized as Express.User);
  });

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: "/api/callback",
        scope: ["email", "profile"],
        state: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const userId = await upsertGoogleUser(profile);
          const serialized: SerializedUser = { id: userId };
          done(null, serialized);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );

  app.get("/api/login", passport.authenticate("google", {
    prompt: "select_account",
  }));

  app.get("/api/callback", passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/api/login",
  }));

  app.get("/api/logout", (req, res) => {
    const typedReq = req as unknown as AuthenticatedRequest & { logout: (cb: () => void) => void; isAuthenticated: () => boolean };

    if (typedReq.session?.phoneAuth) {
      typedReq.session.userId = undefined;
      typedReq.session.phoneAuth = false;
      req.session.destroy(() => {
        res.redirect("/");
      });
      return;
    }

    typedReq.logout(() => {
      req.session.destroy(() => {
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (isDev) {
    const adminId = await getDevAdminUserId();
    (req as unknown as AuthenticatedRequest).user = {
      claims: { sub: adminId },
    };
    return next();
  }

  const typedSession = req.session as session.Session & { userId?: string; phoneAuth?: boolean };

  if (typedSession.userId && typedSession.phoneAuth) {
    (req as unknown as AuthenticatedRequest).user = {
      claims: { sub: typedSession.userId },
    };
    return next();
  }

  const passportUser = req.user as SerializedUser | undefined;
  if (req.isAuthenticated() && passportUser?.id) {
    (req as unknown as AuthenticatedRequest).user = {
      claims: { sub: passportUser.id },
    };
    return next();
  }

  return res.status(401).json({ message: "Unauthorized" });
};
