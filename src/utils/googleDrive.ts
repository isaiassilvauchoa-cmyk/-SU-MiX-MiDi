import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase once
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request full Google Drive scope, matching user-confirmed requested_scopes
provider.addScope("https://www.googleapis.com/auth/drive");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize Auth listener. Helps recover and maintain auth state in memory.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    // If we have a user but no cached token, the UI will handle re-triggering sign-in
    // or using the cached session. To keep things in-memory, we rely on the sign-in flow.
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign-in flow
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Não foi possível extrair o Token de Acesso do Google Sign-In.");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Retrieve current access token
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Log out user
export const logoutUser = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// 1. LIST MIDI FILES FROM GOOGLE DRIVE
export interface DriveMidiFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
}

export const listMidiFiles = async (token: string): Promise<DriveMidiFile[]> => {
  // Query to find MIDI files based on extensions .mid, .midi or MIME type
  const query = encodeURIComponent(
    "trashed = false and (name contains '.mid' or name contains '.midi' or mimeType = 'audio/midi' or mimeType = 'audio/sp-midi')"
  );
  
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name, mimeType, size, createdTime)&spaces=drive&orderBy=name`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Erro ao buscar arquivos do Google Drive (Status: ${response.status})`
    );
  }

  const data = await response.json();
  return data.files || [];
};

// 2. DOWNLOAD FILE CONTENT FROM GOOGLE DRIVE as ArrayBuffer
export const downloadDriveFile = async (fileId: string, token: string): Promise<ArrayBuffer> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Falha no download do arquivo MIDI do Google Drive (Status: ${response.status})`);
  }

  return await response.arrayBuffer();
};

// 3. UPLOAD NEW MIDI FILE TO GOOGLE DRIVE (Two-step upload for name and binary data)
export const uploadMidiToDrive = async (
  filename: string,
  midiDataBlob: Blob,
  token: string
): Promise<DriveMidiFile> => {
  // Step A: Create metadata entry
  const metadataUrl = "https://www.googleapis.com/drive/v3/files";
  const metadataResponse = await fetch(metadataUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: filename,
      mimeType: "audio/midi",
    }),
  });

  if (!metadataResponse.ok) {
    const errorData = await metadataResponse.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Falha ao criar metadados do arquivo na nuvem (Status: ${metadataResponse.status})`
    );
  }

  const fileMetadata = await metadataResponse.json();
  const fileId = fileMetadata.id;

  // Step B: Upload file binary content via media patch
  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const mediaResponse = await fetch(mediaUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "audio/midi",
    },
    body: midiDataBlob,
  });

  if (!mediaResponse.ok) {
    throw new Error(`Falha ao transmitir bytes de sinal MIDI para o Google Drive (Status: ${mediaResponse.status})`);
  }

  return fileMetadata;
};
