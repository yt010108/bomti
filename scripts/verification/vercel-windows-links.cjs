const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

if (process.platform === "win32" && process.env.BOMTI_VERCEL_LINK_COPY_FALLBACK === "true") {
  const fallback = async (target, destination, error) => {
    if (error?.code !== "EPERM") throw error;
    const source = path.resolve(path.dirname(destination), target);
    await fsp.cp(source, destination, { recursive: true, dereference: true, force: true });
  };

  const patchPromises = (module) => {
    const original = module.symlink.bind(module);
    module.symlink = async (target, destination, type) => {
      try {
        return await original(target, destination, type);
      } catch (error) {
        return fallback(target, destination, error);
      }
    };
  };

  const patchCallbacks = (module) => {
    const original = module.symlink.bind(module);
    module.symlink = (target, destination, type, callback) => {
      const linkType = typeof type === "function" ? undefined : type;
      const done = typeof type === "function" ? type : callback;
      return original(target, destination, linkType, async (error) => {
        if (!error) return done?.(null);
        try {
          await fallback(target, destination, error);
          return done?.(null);
        } catch (fallbackError) {
          return done?.(fallbackError);
        }
      });
    };
  };

  patchPromises(fsp);
  patchCallbacks(fs);
  try {
    patchCallbacks(require("graceful-fs"));
  } catch {
    // The Vercel dependency graph may not expose graceful-fs at the root.
  }
}
