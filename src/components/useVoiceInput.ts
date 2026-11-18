import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';
import { voiceErrorMessage, withTranscript } from '../coach/voice';

/**
 * Voice typing for a text box. While listening, what you say is shown after what was typed when you started, words
 * appearing as they are recognised. `onText` gets the whole box each time.
 */
export function useVoiceInput(text: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The box as it was when listening began, so each new guess replaces the last rather than piling up.
  const typed = useRef('');

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const heard = event.results[0]?.transcript ?? '';
    onText(withTranscript(typed.current, heard));
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setError(voiceErrorMessage(event.error));
  });

  const start = async () => {
    setError(null);
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError(voiceErrorMessage('service-not-allowed'));
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError(voiceErrorMessage('not-allowed'));
        return;
      }
      typed.current = text;
      ExpoSpeechRecognitionModule.start({ lang: 'en-NZ', interimResults: true, addsPunctuation: true, continuous: false });
    } catch {
      // A missing native module (Expo Go) or a recognizer that throws must not take the chat down with it.
      setListening(false);
      setError(voiceErrorMessage('unknown'));
    }
  };

  const stop = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  };

  return { listening, error, start, stop, toggle: () => (listening ? stop() : void start()) };
}
