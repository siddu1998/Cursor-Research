'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { MODEL_OPTIONS, type AIProvider } from '@/lib/types';
import { getStoredSettings, saveSettings } from '@/lib/utils';
import {
  X,
  Key,
  Eye,
  EyeOff,
  Check,
  Sparkles,
} from 'lucide-react';

const providers: { id: AIProvider; name: string; color: string }[] = [
  { id: 'openai', name: 'OpenAI', color: '#10A37F' },
  { id: 'gemini', name: 'Google Gemini', color: '#4285F4' },
  { id: 'claude', name: 'Anthropic Claude', color: '#D97706' },
];

export function SettingsDialog() {
  const { settings, updateSettings, settingsDialogOpen, setSettingsDialogOpen } = useStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = getStoredSettings();
    if (stored) {
      updateSettings(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settingsDialogOpen) return null;

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClose = () => {
    saveSettings(settings);
    setSettingsDialogOpen(false);
  };

  const availableModels = MODEL_OPTIONS.filter(
    (m) => m.provider === settings.selectedProvider
  );

  const toggleShow = (key: string) =>
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <>
      <div
        className="dialog-overlay fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={handleClose}
      />
      <div className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-surface rounded-2xl shadow-xl w-full max-w-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent dark:text-text-secondary" />
            <h2 className="text-[16px] font-semibold text-text-primary tracking-[-0.02em]">Settings</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Provider Selection */}
          <div>
            <label className="text-sm font-medium text-text-primary mb-3 block">
              AI Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    updateSettings({ selectedProvider: p.id });
                    const firstModel = MODEL_OPTIONS.find((m) => m.provider === p.id);
                    if (firstModel) updateSettings({ selectedModel: firstModel.id });
                  }}
                  className={`
                    px-3 py-2.5 rounded-xl text-sm font-medium border transition-all
                    ${
                      settings.selectedProvider === p.id
                        ? 'border-accent dark:border-text-secondary bg-accent-light text-accent dark:text-text-primary'
                        : 'border-border text-text-secondary hover:border-text-tertiary'
                    }
                  `}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">
              Model
            </label>
            <select
              value={settings.selectedModel}
              onChange={(e) => updateSettings({ selectedModel: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent transition-colors appearance-none"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Keys */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-text-primary flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" />
              API Keys
            </label>
            <p className="text-xs text-text-tertiary -mt-2">
              Keys are stored locally in your browser. Never sent to our servers.
            </p>

            {/* OpenAI */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type={showKeys.openai ? 'text' : 'password'}
                  value={settings.openaiKey}
                  onChange={(e) => updateSettings({ openaiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => toggleShow('openai')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showKeys.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Gemini */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                Google Gemini API Key
              </label>
              <div className="relative">
                <input
                  type={showKeys.gemini ? 'text' : 'password'}
                  value={settings.geminiKey}
                  onChange={(e) => updateSettings({ geminiKey: e.target.value })}
                  placeholder="AIza..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => toggleShow('gemini')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Claude */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                Anthropic Claude API Key
              </label>
              <div className="relative">
                <input
                  type={showKeys.claude ? 'text' : 'password'}
                  value={settings.claudeKey}
                  onChange={(e) => updateSettings({ claudeKey: e.target.value })}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => toggleShow('claude')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showKeys.claude ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* App Data API Keys */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-text-primary flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" />
              App Data API Keys
            </label>
            <p className="text-xs text-text-tertiary -mt-2">
              Connect external apps to import data directly into your canvas.
            </p>

            {/* Twitter / X */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1.5">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X (Twitter) Bearer Token
              </label>
              <div className="relative">
                <input
                  type={showKeys.twitter ? 'text' : 'password'}
                  value={settings.twitterBearerToken}
                  onChange={(e) => updateSettings({ twitterBearerToken: e.target.value })}
                  placeholder="AAAA..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => toggleShow('twitter')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showKeys.twitter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Reddit */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1.5">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                Reddit Client ID
              </label>
              <div className="relative">
                <input
                  type={showKeys.redditId ? 'text' : 'password'}
                  value={settings.redditClientId}
                  onChange={(e) => updateSettings({ redditClientId: e.target.value })}
                  placeholder="Client ID..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => toggleShow('redditId')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showKeys.redditId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">
                Reddit Client Secret
              </label>
              <div className="relative">
                <input
                  type={showKeys.redditSecret ? 'text' : 'password'}
                  value={settings.redditClientSecret}
                  onChange={(e) => updateSettings({ redditClientSecret: e.target.value })}
                  placeholder="Secret..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => toggleShow('redditSecret')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showKeys.redditSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-hover/50">
          {saved && (
            <span className="text-sm text-success flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-xl transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </>
  );
}
