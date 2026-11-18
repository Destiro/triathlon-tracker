import { ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';

// Talking to the coach uses the phone's own speech recognition (Google's on a Galaxy), so what you say is turned into
// text on the phone, free, and goes into the message box for you to check before sending. Nothing is sent to Claude
// until you tap Send.

/** A plain message for a recognition error, or null when there is nothing to tell (you stopped it yourself). */
export function voiceErrorMessage(code: ExpoSpeechRecognitionErrorCode): string | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'no-speech':
    case 'speech-timeout':
      return 'Didn’t catch that. Tap the microphone and try again.';
    case 'not-allowed':
      return 'The app isn’t allowed to use the microphone. Allow it in Android settings, under Apps > Triathlon Tracker > Permissions.';
    case 'network':
      return 'Voice typing needs a connection right now. Try again, or type instead.';
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'Voice typing isn’t available on this phone. Check that the Google app is installed and up to date.';
    case 'busy':
    case 'too-many-requests':
      return 'Voice typing is busy. Wait a moment and try again.';
    default:
      return 'Voice typing stopped unexpectedly. Try again, or type instead.';
  }
}

/** What was already typed, then what you are saying, with one space between. */
export function withTranscript(typed: string, heard: string): string {
  const said = heard.trim();
  if (!said) return typed;
  const before = typed.trimEnd();
  return before ? `${before} ${said}` : said;
}
