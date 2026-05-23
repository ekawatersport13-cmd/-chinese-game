import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCyUnzm946N9ammDgXWNdRo7SZNz5XRnTw",
  authDomain: "chinesegame-4317f.firebaseapp.com",
  databaseURL: "https://chinesegame-4317f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chinesegame-4317f",
  storageBucket: "chinesegame-4317f.firebasestorage.app",
  messagingSenderId: "843830906860",
  appId: "1:843830906860:web:52d63501637773539b3ac9",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
