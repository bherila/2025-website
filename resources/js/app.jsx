import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';

function Demo() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
      <div className="space-x-2">
        <Button>Button</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
      </div>
    </div>
  );
}

const el = document.getElementById('app');
if (el) {
  createRoot(el).render(<Demo />);
}
