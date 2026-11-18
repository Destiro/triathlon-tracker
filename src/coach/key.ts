import * as SecureStore from 'expo-secure-store';

// The Anthropic API key lives in the phone's secure storage (the Android keystore), never in the saved app data,
// so it is not in backups and can't leak through a shared backup file.
const KEY_NAME = 'coach-anthropic-api-key';

/** The saved key, or null when there is none or secure storage can't be read. */
export async function loadKey(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(KEY_NAME)) || null;
  } catch {
    return null;
  }
}

/** Saves the key. Resolves to false when secure storage refused it. */
export async function saveKey(key: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(KEY_NAME, key);
    return true;
  } catch {
    return false;
  }
}

export async function clearKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_NAME);
  } catch {
    // Nothing to do: the key is forgotten in memory either way.
  }
}

/** Anthropic keys start "sk-ant-". Catches a pasted wrong thing before the first message fails. */
export const looksLikeKey = (key: string): boolean => /^sk-ant-[\w-]{20,}$/.test(key.trim());
