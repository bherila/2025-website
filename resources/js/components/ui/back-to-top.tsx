import * as React from 'react';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      // Show button when page is scrolled down more than 300px
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      className='fixed bottom-6 right-6 z-50 p-3 rounded-full bg-slate-900 text-white hover:bg-slate-900/90 shadow-lg transition-all duration-300 print:hidden'
      aria-label='Back to top'
      title='Back to top'
    >
      <ArrowUp className='w-5 h-5' />
    </button>
  );
}
