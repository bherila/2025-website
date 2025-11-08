import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, AlertDescription } from './components/ui/alert';
import { Spinner } from './components/ui/spinner';
import { ApiKeySection } from './user/api-key';
import { UpdateEmailSection } from './user/update-email';
import { UpdatePasswordSection } from './user/update-password';

interface User {
  id: number;
  name: string;
  email: string;
  gemini_api_key: string | null;
}

const MyAccount: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      } else {
        setErrors({ general: 'Failed to load user data' });
      }
    } catch (error) {
      setErrors({ general: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-[200px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      {errors.general && (
        <Alert variant="destructive">
          <AlertDescription>{errors.general}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <UpdateEmailSection
        currentEmail={user?.email || ''}
        onSuccess={setSuccess}
        onError={(field, message) => setErrors({ [field]: message })}
      />

      <UpdatePasswordSection
        onSuccess={setSuccess}
        onError={(field, message) => setErrors({ [field]: message })}
      />

      <ApiKeySection
        user={user}
        onSuccess={setSuccess}
        onError={(field, message) => setErrors({ [field]: message })}
        onUserUpdate={fetchUserData}
      />
    </div>
  );
};

const mount = document.getElementById('my-account');
if (mount) {
  createRoot(mount).render(<MyAccount />);
}