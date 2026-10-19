import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/styles.css';

// No StrictMode: its double-mount would register the P2P host twice under the same room id.
createRoot(document.getElementById('root')!).render(<App />);
