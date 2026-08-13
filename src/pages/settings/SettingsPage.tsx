import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'

// Figma "설정 #9.1" — 알림/언어. 백엔드 개념이 없는 순수 UI 설정이라 브라우저에만 저장한다.
const STORAGE_KEY = 'adminSettings'
const LANGUAGE_OPTIONS = ['한국어', 'English']

interface StoredSettings {
  appNotifications: boolean
  emailNotifications: boolean
  language: string
}

function readSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoredSettings
  } catch {
    // 저장된 값이 손상된 경우 기본값을 쓴다
  }
  return { appNotifications: true, emailNotifications: false, language: LANGUAGE_OPTIONS[0] }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<StoredSettings>(readSettings)
  const [saved, setSaved] = useState(false)

  function onSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h1>설정</h1>
      <Card className="mt-6">
        <h3>알림 · 언어 설정</h3>
        <div className="mt-4 divide-y divide-line">
          <div className="flex items-center justify-between py-4">
            <span className="text-sm font-medium">앱 알림 받기</span>
            <Toggle
              checked={settings.appNotifications}
              onChange={(v) => setSettings((s) => ({ ...s, appNotifications: v }))}
            />
          </div>
          <div className="flex items-center justify-between py-4">
            <span className="text-sm font-medium">이메일 알림</span>
            <Toggle
              checked={settings.emailNotifications}
              onChange={(v) => setSettings((s) => ({ ...s, emailNotifications: v }))}
            />
          </div>
          <div className="flex items-center justify-between py-4">
            <span className="text-sm font-medium">언어</span>
            <select
              value={settings.language}
              onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}
              className="h-11 px-4 rounded-lg border border-[#DEE2EB] bg-field text-sm"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button className="mt-6" onClick={onSave}>
          저장
        </Button>
        {saved && <p className="text-[13px] text-muted mt-2">저장됐습니다.</p>}
      </Card>
    </div>
  )
}
