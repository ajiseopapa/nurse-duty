import { getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDH5jLGveC8qhHuJFJkLd9R4I57YtYzu0U',
  authDomain: 'nurse-duty-sgrh.firebaseapp.com',
  projectId: 'nurse-duty-sgrh',
  storageBucket: 'nurse-duty-sgrh.firebasestorage.app',
  messagingSenderId: '963315585049',
  appId: '1:963315585049:web:2b132a51cbaee4cf1f1a88',
  measurementId: 'G-S091ZDMHYF',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const db = getFirestore(app);
