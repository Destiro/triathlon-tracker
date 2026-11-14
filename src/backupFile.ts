import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { BackupError } from './backup';

// The phone side of backups: writing the file and handing it to the share sheet, and picking one to restore.

/** Writes the backup and opens the share sheet, so you can save it to Google Drive or send it to yourself. */
export async function shareBackup(json: string, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('This phone cannot share files.');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your training backup' });
}

/** Opens the file picker and returns the chosen file's text, or null if nothing was picked. */
export async function pickBackup(): Promise<string | null> {
  // Some file apps don't label .json files as JSON, so anything can be picked; the contents are checked instead.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  return picked.result.text();
}
