'use client'

import React from 'react'
import { ArrowRight, ArrowUpRight, Coffee, Plane, Briefcase, GraduationCap, Info, Settings2, TriangleAlert } from 'lucide-react'
import {
  SPEAKING_SCENARIOS,
  SCENARIO_GROUPS,
  SPEAKING_LEVELS,
  SPEAKING_VOICES,
  CORRECTION_MODES,
} from '@/lib/speaking/scenarios'
import { useSpeakingStore } from '@/store/useSpeakingStore'
import { useAiAssistantStore } from '@/store/useAiAssistantStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import {
  getTtsProviderMeta,
  isChatModelReady,
  isTtsProviderConfigured,
  isTtsReady,
} from '@/lib/speaking/ttsConfig'
import { isAsrReady } from '@/lib/speaking/asrConfig'

const GROUP_ICON = { 日常: Coffee, 旅行: Plane, 职场: Briefcase, 考试: GraduationCap }
const SPEEDS = [0.8, 1, 1.2]

function OptionRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-10 shrink-0 h-8 leading-8 text-sm text-muted-foreground whitespace-nowrap">{label}</span>
      <div className="flex-1 grid grid-flow-col auto-cols-fr gap-1">
        {options.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            onClick={() => onChange(o.id)}
            className={`h-8 px-1 rounded-md text-sm whitespace-nowrap cursor-pointer transition-colors ${
              value === o.id
                ? 'bg-primary text-primary-foreground font-medium'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SpeakingSetup() {
  const scenarioId = useSpeakingStore((s) => s.scenarioId)
  const customTopic = useSpeakingStore((s) => s.customTopic)
  const level = useSpeakingStore((s) => s.level)
  const voice = useSpeakingStore((s) => s.voice)
  const speed = useSpeakingStore((s) => s.speed)
  const correction = useSpeakingStore((s) => s.correction)
  const tts = useSpeakingStore((s) => s.tts)
  const asr = useSpeakingStore((s) => s.asr)
  const aiConfig = useAiAssistantStore((s) => s.aiConfig)
  const setSettingsModalOpen = useWorkspaceStore((s) => s.setSettingsModalOpen)
  const st = useSpeakingStore.getState()
  const chatReady = isChatModelReady(aiConfig)
  const ttsReady = isTtsReady(tts, voice).ready
  const ttsMeta = getTtsProviderMeta(tts.provider)
  const ttsLabel =
    tts.provider === 'browser'
      ? '浏览器内置语音 · 免密钥'
      : `${ttsMeta.name} · ${isTtsProviderConfigured(tts) ? '已填写凭据' : '未填写凭据'}`
  const asrReady = isAsrReady(asr, tts).ready
  const asrLabel =
    asr.provider === 'browser'
      ? '浏览器内置识别 · 免配置'
      : `豆包语音识别 · ${asrReady ? '已就绪' : '待配置'}`

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">
        <div className="space-y-3">
          <div className="text-[15px] font-medium text-foreground">选择场景</div>
          {SCENARIO_GROUPS.map((g) => {
            const Icon = GROUP_ICON[g]
            return (
              <div key={g} className="space-y-1.5">
                <div className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Icon className="size-4" />
                  {g}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SPEAKING_SCENARIOS.filter((s) => s.group === g).map((s) => {
                    const active = !customTopic && scenarioId === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => st.setScenario(s.id)}
                        className={`h-8 px-3.5 rounded-full text-sm border cursor-pointer transition-colors ${
                          active
                            ? 'border-primary bg-primary/12 text-primary font-medium'
                            : 'border-border text-foreground hover:border-primary/40'
                        }`}
                      >
                        {s.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div className="space-y-1.5 pt-1">
            <div className="text-[13px] text-muted-foreground">或自定义话题</div>
            <input
              value={customTopic}
              onChange={(e) => st.setCustomTopic(e.target.value)}
              placeholder="例如：和外国同事聊周末计划"
              className={`w-full h-9 px-3 rounded-md bg-muted border text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
                customTopic ? 'border-primary' : 'border-transparent focus:border-primary/50'
              }`}
            />
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-3">
          <div className="text-[15px] font-medium text-foreground">对话设置</div>
          <OptionRow
            label="难度"
            options={SPEAKING_LEVELS.map((l) => ({ id: l, label: l }))}
            value={level}
            onChange={st.setLevel}
          />
          <OptionRow label="音色" options={[...SPEAKING_VOICES]} value={voice} onChange={st.setVoice} />
          <OptionRow
            label="语速"
            options={SPEEDS.map((s) => ({ id: s, label: `${s.toFixed(1)}x` }))}
            value={speed}
            onChange={st.setSpeed}
          />
          <OptionRow label="纠错" options={[...CORRECTION_MODES]} value={correction} onChange={st.setCorrection} />
        </div>

        <div className="space-y-2.5">
          {/* 对话模型：只读，沿用 AI 模型配置 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[15px] font-medium text-foreground">对话模型</div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true, 'ai')}
                className="text-[13px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 cursor-pointer"
              >
                沿用 AI 模型配置
                <ArrowUpRight className="size-3.5" />
              </button>
            </div>
            {chatReady.ready ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                <span className="font-mono text-muted-foreground truncate">{aiConfig.model}</span>
                <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  已就绪
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1">
                <div className="flex items-start gap-2 text-[13px] text-amber-300 leading-relaxed">
                  <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                  <span>{chatReady.reason}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(true, 'ai')}
                  className="text-[13px] font-medium text-amber-200 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  去配置 AI 模型
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 语音合成：口语唯一需要单独配置的服务 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[15px] font-medium text-foreground">语音合成</div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true, 'tts')}
                className="text-[13px] text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Settings2 className="size-3.5" />
                语音设置
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground truncate">{ttsLabel}</span>
              <span
                className={`shrink-0 px-2 py-0.5 rounded border ${
                  ttsReady
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                }`}
              >
                {ttsReady ? '已就绪' : '待配置'}
              </span>
            </div>
          </div>

          {/* 语音识别：把你说的转成文字 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[15px] font-medium text-foreground">语音识别</div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true, 'asr')}
                className="text-[13px] text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Settings2 className="size-3.5" />
                识别设置
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground truncate">{asrLabel}</span>
              <span
                className={`shrink-0 px-2 py-0.5 rounded border ${
                  asrReady
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                }`}
              >
                {asrReady ? '已就绪' : '待配置'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          <Info className="size-4 mt-0.5 shrink-0" />
          <span>
            对话由「AI 模型配置」生成，你说的话由「语音识别」转成文字，AI 的回复由「语音合成」读出来。
            识别或合成没配好时，可以用右下角键盘图标输入。所有密钥只保存在本机浏览器。
          </span>
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-border">
        <button
          type="button"
          onClick={st.startSession}
          className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-[15px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          开始对话
          <ArrowRight className="size-4" />
        </button>
      </div>
    </>
  )
}
