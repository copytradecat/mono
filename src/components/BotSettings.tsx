import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Settings {
  maxTradeAmount: number;
  // Add other settings as needed
}

export default function BotSettings() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSettings, setEditedSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (session) {
      fetchSettings();
    }
  }, [session]);

  const fetchSettings = async () => {
    const response = await fetch('/api/bot-settings');
    if (response.ok) {
      const data = await response.json();
      setSettings(data.settings);
      setEditedSettings(data.settings);
    }
  };

  const updateSetting = async () => {
    if (!editedSettings) return;

    const response = await fetch('/api/bot-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: editedSettings }),
    });

    if (response.ok) {
      setSettings(editedSettings);
      setIsEditing(false);
    }
  };

  const handleInputChange = (setting: keyof Settings, value: number | string) => {
    setEditedSettings(prev => prev ? { ...prev, [setting]: value } : null);
  };

  if (!settings) return <div>Loading settings...</div>;

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Bot Settings</h2>
      {isEditing ? (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Max Trade Amount:</label>
            <input 
              type="number" 
              value={editedSettings?.maxTradeAmount} 
              onChange={(e) => handleInputChange('maxTradeAmount', parseInt(e.target.value, 10))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
          </div>
          {/* Add more settings inputs as needed */}
          <div className="flex justify-end space-x-2">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
            <button onClick={updateSetting} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Save</button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <span className="font-medium">Max Trade Amount:</span> {settings.maxTradeAmount}
          </div>
          {/* Display more settings here */}
          <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Edit Settings</button>
        </>
      )}
    </div>
  );
}
