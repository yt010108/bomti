const { appendFileSync, writeFileSync } = require("node:fs");
const net = require("node:net");
const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");
const tls = require("node:tls");

const output = process.env.BOMTI_NETWORK_GUARD_OUT;
const state = { dnsAttempts: 0, nonLoopbackAttempts: 0, blocked: [] };

function flush() {
  if (output) writeFileSync(output, `${JSON.stringify(state)}\n`, "utf8");
}

function permitted(host) {
  if (!host || host === "localhost" || host === "::1") return true;
  return net.isIP(host) !== 0 && (host.startsWith("127.") || host === "::1");
}

function reject(kind, host) {
  if (permitted(host)) return;
  state.nonLoopbackAttempts += 1;
  state.blocked.push(kind);
  flush();
  throw new Error("OUTBOUND_NETWORK_BLOCKED");
}

function hostFromOptions(options) {
  if (typeof options === "string") return new URL(options).hostname;
  if (options instanceof URL) return options.hostname;
  return options?.hostname ?? options?.host?.split(":")[0];
}

for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt"]) {
  const original = dns[name];
  if (typeof original !== "function") continue;
  dns[name] = function guardedDns(host, ...args) {
    state.dnsAttempts += 1;
    reject(`dns:${name}`, host);
    return original.call(this, host, ...args);
  };
}

for (const [module, name] of [[net, "connect"], [net, "createConnection"], [tls, "connect"]]) {
  const original = module[name];
  module[name] = function guardedConnect(...args) {
    const options = typeof args[0] === "object" ? args[0] : { host: args[1] };
    reject(`socket:${name}`, options?.host ?? options?.hostname);
    return original.apply(this, args);
  };
}

for (const module of [http, https]) {
  const original = module.request;
  module.request = function guardedRequest(...args) {
    reject("http:request", hostFromOptions(args[0]));
    return original.apply(this, args);
  };
}

process.once("exit", flush);
if (output) appendFileSync(output, "", "utf8");
