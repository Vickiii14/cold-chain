// Paste your Firebase web-app config here (Firebase Console → Project settings → Your apps → Web).
// While apiKey still says YOUR_API_KEY the dashboard runs in DEMO mode with simulated data.
export const firebaseConfig = {
  apiKey: "AIzaSyDDYYQ_QhFs9Kt1W7AuKkGQKiFmqxbDLhk",
  authDomain: "cold-chain-59ea3.firebaseapp.com",
  projectId: "cold-chain-59ea3",
  storageBucket: "cold-chain-59ea3.firebasestorage.app",
  messagingSenderId: "26207448221",
  appId: "1:26207448221:web:f09f9188f7cf82a1b9b874"
};

// Firestore collection the ESP32 writes into
export const COLLECTION = "readings";
