import { supabasePublicKey, supabaseUrl } from "./wishbox-config.js?v=secret-box-1";

const BOX_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_TOKEN_PREFIX = "wishbox-owner:";
const MAX_MESSAGE_LENGTH = 1000;
const MAX_ENCRYPTED_MESSAGE_LENGTH = 8192;

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("The private inbox key or encrypted message is invalid.");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

function getSupabaseConfig() {
  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error("Secret message storage is not configured. Add your Supabase project URL and public anon/publishable key in assets/wishbox-config.js.");
  }
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error("The Supabase project URL in assets/wishbox-config.js is invalid.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("The Supabase project URL must use HTTPS.");
  }
  return { url: url.href.replace(/\/+$/, ""), apiKey: supabasePublicKey };
}

async function callRpc(name, parameters) {
  const { url, apiKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parameters),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    let message = responseBody || `Supabase request failed (${response.status}).`;
    if (responseBody) {
      try {
        const detail = JSON.parse(responseBody);
        message = detail.message || detail.details || message;
      } catch {
        message = responseBody;
      }
    }
    throw new Error(message);
  }
  if (!responseBody) return null;
  try {
    return JSON.parse(responseBody);
  } catch {
    throw new Error("Supabase returned an unreadable response.");
  }
}

export function isSecretBoxId(value) {
  return typeof value === "string" && BOX_ID_PATTERN.test(value);
}

export function createSecretBoxId() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("This browser cannot create a secure secret box. Please use a modern browser over HTTPS.");
  }
  if (cryptoApi.randomUUID) return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createOwnerToken() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("This browser cannot create a secure private inbox key. Please use a modern browser over HTTPS.");
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

export async function createSecretBoxKeys() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot encrypt secret messages. Please use a modern browser over HTTPS.");
  }
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey("spki", keys.publicKey),
    crypto.subtle.exportKey("pkcs8", keys.privateKey),
  ]);
  return {
    publicKey: bytesToBase64Url(new Uint8Array(publicKey)),
    privateKey: bytesToBase64Url(new Uint8Array(privateKey)),
  };
}

export function getStoredOwnerCredentials(boxId) {
  if (!isSecretBoxId(boxId)) return null;
  const serialized = localStorage.getItem(`${OWNER_TOKEN_PREFIX}${boxId}`);
  if (!serialized) return null;
  let credentials;
  try {
    credentials = JSON.parse(serialized);
  } catch {
    throw new Error("The saved private inbox key is damaged. Use your saved private inbox link.");
  }
  if (
    typeof credentials?.ownerToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(credentials.ownerToken) ||
    typeof credentials?.privateKey !== "string"
  ) {
    throw new Error("The saved private inbox key is incomplete. Use your saved private inbox link.");
  }
  return credentials;
}

export function storeOwnerCredentials(boxId, credentials) {
  if (
    !isSecretBoxId(boxId) ||
    typeof credentials?.ownerToken !== "string" ||
    typeof credentials?.privateKey !== "string"
  ) {
    throw new Error("Could not save the private inbox key.");
  }
  localStorage.setItem(`${OWNER_TOKEN_PREFIX}${boxId}`, JSON.stringify(credentials));
}

export async function createSecretBox(boxId, ownerToken) {
  await callRpc("create_wish_secret_box", {
    p_box_id: boxId,
    p_owner_token: ownerToken,
  });
}

export async function encryptSecretMessage(publicKeyData, message) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage || normalizedMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Write a message up to ${MAX_MESSAGE_LENGTH} characters.`);
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot encrypt secret messages. Please use a modern browser over HTTPS.");
  }
  const publicKey = await crypto.subtle.importKey(
    "spki",
    base64UrlToBytes(publicKeyData),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const rawAesKey = crypto.getRandomValues(new Uint8Array(32));
  const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const [encryptedKey, ciphertext] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey),
    crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      new TextEncoder().encode(normalizedMessage),
    ),
  ]);
  return JSON.stringify({
    version: 1,
    key: bytesToBase64Url(new Uint8Array(encryptedKey)),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  });
}

export async function decryptSecretMessages(entries, privateKeyData) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot decrypt secret messages. Please use a modern browser over HTTPS.");
  }
  let privateKey;
  try {
    privateKey = await crypto.subtle.importKey(
      "pkcs8",
      base64UrlToBytes(privateKeyData),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
  } catch {
    throw new Error("The private inbox key is invalid or damaged.");
  }
  return Promise.all(entries.map(async (entry) => ({
    ...entry,
    message: await decryptSecretMessage(entry.message, privateKey),
  })));
}

async function decryptSecretMessage(value, privateKey) {
  let envelope;
  try {
    envelope = JSON.parse(value);
  } catch {
    throw new Error("A saved message has an invalid encrypted format.");
  }
  if (envelope?.version !== 1) {
    throw new Error("A saved message uses an unsupported encryption format.");
  }
  try {
    const rawAesKey = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      base64UrlToBytes(envelope.key),
    );
    const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(envelope.iv) },
      aesKey,
      base64UrlToBytes(envelope.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("A message could not be decrypted. Check that you opened the matching private inbox link.");
  }
}

export async function submitSecretMessage(boxId, encryptedMessage) {
  if (typeof encryptedMessage !== "string" || encryptedMessage.length > MAX_ENCRYPTED_MESSAGE_LENGTH) {
    throw new Error("The encrypted message is too long to send.");
  }
  await callRpc("submit_wish_secret_message", {
    p_box_id: boxId,
    p_message: encryptedMessage,
  });
}

export async function getSecretMessages(boxId, ownerToken) {
  const result = await callRpc("read_wish_secret_messages", {
    p_box_id: boxId,
    p_owner_token: ownerToken,
  });
  if (!Array.isArray(result)) {
    throw new Error("Supabase returned an invalid inbox response.");
  }
  return result;
}
