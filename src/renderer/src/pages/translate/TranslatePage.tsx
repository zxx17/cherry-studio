import { CheckOutlined, SendOutlined, SettingOutlined, SwapOutlined, WarningOutlined } from '@ant-design/icons'
import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import CopyIcon from '@renderer/components/Icons/CopyIcon'
import { isLocalAi } from '@renderer/config/env'
import { translateLanguageOptions } from '@renderer/config/translate'
import db from '@renderer/databases'
import { useDefaultModel } from '@renderer/hooks/useAssistant'
import { fetchTranslate } from '@renderer/services/ApiService'
import { getDefaultTranslateAssistant } from '@renderer/services/AssistantService'
import { Assistant, Message } from '@renderer/types'
import { runAsyncFunction, uuid } from '@renderer/utils'
import { Button, Select, Space } from 'antd'
import TextArea, { TextAreaRef } from 'antd/es/input/TextArea'
import { isEmpty } from 'lodash'
import { debounce } from 'lodash'
import React, { FC, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import styled from 'styled-components'

let _text = ''
let _result = ''
let _targetLanguage = 'english'

const TranslatePage: FC = () => {
  const { t } = useTranslation()
  const [targetLanguage, setTargetLanguage] = useState(_targetLanguage)
  const [text, setText] = useState(_text)
  const [result, setResult] = useState(_result)
  const { translateModel } = useDefaultModel()
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const textAreaRef = useRef<TextAreaRef>(null)

  _text = text
  _result = result
  _targetLanguage = targetLanguage

  const safetyMarginOfTextarea = (textarea: HTMLTextAreaElement): number => {
    const defaultSafetyMargin = 30
    const lineHeight = window.getComputedStyle(textarea).lineHeight
    if (lineHeight.endsWith('px')) {
      const safetyMargin = parseInt(lineHeight.slice(0, -2))
      if (Number.isNaN(safetyMargin)) {
        return defaultSafetyMargin
      } else {
        return safetyMargin + 4
      }
    } else {
      return defaultSafetyMargin
    }
  }

  const updateTextareaToMaxHeight = (textarea: HTMLTextAreaElement, safetyMargin: number) => {
    const { top: textareaTop } = textarea.getBoundingClientRect()
    textarea.style.height = `${window.innerHeight - safetyMargin - textareaTop}px`
  }

  const updateTextareaHeight = useCallback((textarea: HTMLTextAreaElement, contentContainer: HTMLDivElement | null) => {
    textarea.style.height = 'auto'
    const unlimitedHeightUpdate = () => {
      textarea.style.height = `${textarea.scrollHeight}px`
    }
    const safetyMargin = safetyMarginOfTextarea(textarea)

    if (contentContainer) {
      const { bottom: textareaBottom, top: textareaTop } = textarea.getBoundingClientRect()
      const { bottom: contentContainerBottom } = contentContainer.getBoundingClientRect()
      if (textareaBottom !== 0 && contentContainerBottom !== 0) {
        if (contentContainerBottom - textareaTop - textarea.scrollHeight < safetyMargin) {
          updateTextareaToMaxHeight(textarea, safetyMargin)
        } else {
          unlimitedHeightUpdate()
        }
      } else {
        unlimitedHeightUpdate()
      }
    } else {
      unlimitedHeightUpdate()
    }
  }, [])

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateTextareaHeight(event.target, contentContainerRef.current)
  }

  useEffect(() => {
    // Initialize when switching to this page
    if (textAreaRef?.current?.resizableTextArea?.textArea) {
      updateTextareaHeight(textAreaRef.current.resizableTextArea.textArea, contentContainerRef.current)
    }

    const debounceHandleResize = debounce(
      () => {
        if (textAreaRef?.current?.resizableTextArea) {
          updateTextareaHeight(textAreaRef.current.resizableTextArea.textArea, contentContainerRef.current)
        }
      },
      16,
      { maxWait: 16 }
    )

    const handleResize = () => debounceHandleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [textAreaRef, updateTextareaHeight])

  const onTranslate = async () => {
    if (!text.trim()) {
      return
    }

    if (!translateModel) {
      window.message.error({
        content: t('translate.error.not_configured'),
        key: 'translate-message'
      })
      return
    }

    const assistant: Assistant = getDefaultTranslateAssistant(targetLanguage, text)

    const message: Message = {
      id: uuid(),
      role: 'user',
      content: '',
      assistantId: assistant.id,
      topicId: uuid(),
      model: translateModel,
      createdAt: new Date().toISOString(),
      type: 'text',
      status: 'sending'
    }

    setLoading(true)
    await fetchTranslate({ message, assistant, onResponse: (text) => setResult(text) })
    setLoading(false)
  }

  const onCopy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    isEmpty(text) && setResult('')
  }, [text])

  useEffect(() => {
    runAsyncFunction(async () => {
      const targetLang = await db.settings.get({ id: 'translate:target:language' })
      targetLang && setTargetLanguage(targetLang.value)
    })
  }, [])

  const SettingButton = () => {
    if (isLocalAi) {
      return null
    }

    if (translateModel) {
      return (
        <Link to="/settings/model" style={{ color: 'var(--color-text-2)' }}>
          <SettingOutlined />
        </Link>
      )
    }

    return (
      <Link to="/settings/model" style={{ marginLeft: -10 }}>
        <Button
          type="link"
          style={{ color: 'var(--color-error)', textDecoration: 'underline' }}
          icon={<WarningOutlined />}>
          {t('translate.error.not_configured')}
        </Button>
      </Link>
    )
  }

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>{t('translate.title')}</NavbarCenter>
      </Navbar>
      <ContentContainer id="content-container" ref={contentContainerRef}>
        <MenuContainer>
          <Select
            showSearch
            value="any"
            style={{ width: 180 }}
            optionFilterProp="label"
            disabled
            options={[{ label: t('translate.any.language'), value: 'any' }]}
          />
          <SwapOutlined />
          <Select
            showSearch
            value={targetLanguage}
            style={{ width: 180 }}
            optionFilterProp="label"
            options={translateLanguageOptions()}
            onChange={(value) => {
              setTargetLanguage(value)
              db.settings.put({ id: 'translate:target:language', value })
            }}
            optionRender={(option) => (
              <Space>
                <span role="img" aria-label={option.data.label}>
                  {option.data.emoji}
                </span>
                {option.label}
              </Space>
            )}
          />
          <SettingButton />
        </MenuContainer>
        <TranslateInputWrapper>
          <InputContainer>
            <Textarea
              ref={textAreaRef}
              onInput={handleInput}
              variant="borderless"
              placeholder={t('translate.input.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
              spellCheck={false}
              allowClear
            />
            <TranslateButton
              type="primary"
              loading={loading}
              onClick={onTranslate}
              disabled={!text.trim()}
              icon={<SendOutlined />}>
              {t('translate.button.translate')}
            </TranslateButton>
          </InputContainer>
          <OutputContainer>
            <OutputText>{result || t('translate.output.placeholder')}</OutputText>
            <CopyButton
              onClick={onCopy}
              disabled={!result}
              icon={copied ? <CheckOutlined style={{ color: 'var(--color-primary)' }} /> : <CopyIcon />}
            />
          </OutputContainer>
        </TranslateInputWrapper>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  padding: 20px;
`

const MenuContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 15px;
  gap: 20px;
`

const TranslateInputWrapper = styled.div`
  display: flex;
  flex-direction: row;
  min-height: 350px;
  gap: 20px;
`

const InputContainer = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
`

const Textarea = styled(TextArea)`
  display: flex;
  flex: 1;
  padding: 20px;
  font-size: 16px;
  overflow: auto;
  .ant-input {
    resize: none;
    padding: 15px 20px;
  }
`

const OutputContainer = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  padding: 10px;
  background-color: var(--color-background-soft);
  border-radius: 10px;
`

const OutputText = styled.div`
  padding: 5px 10px;
  max-height: calc(100vh - var(--navbar-height) - 120px);
  overflow: auto;
  white-space: pre-wrap;
`

const TranslateButton = styled(Button)`
  position: absolute;
  right: 15px;
  bottom: 15px;
  z-index: 10;
`

const CopyButton = styled(Button)`
  position: absolute;
  right: 15px;
  bottom: 15px;
`

export default TranslatePage
