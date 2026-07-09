import { useState, useEffect, useRef } from 'react'

export default function App() {

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([])   // list of chat messages
  const [input, setInput] = useState('')   // what the user is typing
  const [status, setStatus] = useState('')   // live status from C++ tool
  const [loading, setLoading] = useState(false)// true while tool is running
  const [tools, setTools] = useState([])   // tool list from C++ server
  const [activeTool, setActiveTool] = useState('') // currently active tool
  const [previousInteractionId, setPreviousInteractionId] = useState(null) // Gemini session ID
  const [prevChatMsgs, setPrevChatMsgs] = useState([])
  const [showPrevChat, setShowPrevChat] = useState(false)

  const bottomRef = useRef(null)

  useEffect(() => {
    // 1. Ask C++ server for list of tools
    window.api.getTools()
      .then(toolList => {
        setTools(toolList)
        if (toolList.length > 0) {
          setActiveTool(toolList[0].name)
        }
      })
      .catch(() => setTools([]))
  }, [])

  // ── useEffect: runs once when the app loads ────────────────────────────────
  useEffect(() => {

    // 2. Start listening for WebSocket messages from C++
    const removeListener = window.api.onMessage((rawMessage) => {
      const frame = JSON.parse(rawMessage)

      if (frame.type === 'status') {
        setStatus(frame.data)
      }

      if (frame.type === 'result') {
        const data = frame.data
        if (data.tool) {
          const { text, interaction_id } = data
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: text,
            tool: data.tool
          }])
          setPreviousInteractionId(interaction_id)
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: JSON.stringify(data)
          }])
        }
        setStatus('')
        setLoading(false)
      }

      if (frame.type === 'error') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `Error: ${frame.data}`,
          tool: activeTool
        }])
        setStatus('')
        setLoading(false)
      }
    })

    return () => removeListener()

  }, [activeTool]) // Rebind activeTool if required or keep activeTool reference in state handler

  // ── Auto-scroll to bottom ──────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, showPrevChat])

  // ── handleSend ─────────────────────────────────────────────────────────────
  function handleSend() {
    if (loading) return
    if (!input.trim()) return

    let request = null

    if (activeTool) {
      request = {
        id: Date.now().toString(),
        tool: activeTool,
        args: {
          input: input,
          previous_interaction_id: previousInteractionId
        },
      }
    }
    setMessages(prev => [...prev, { role: 'user', text: input }])
    setInput('')
    setLoading(true)

    window.api.sendToolRequest(request)
  }

  // ── handleReset ────────────────────────────────────────────────────────────
  function handleReset() {
    setPreviousInteractionId(null)
    setPrevChatMsgs(messages)
    setMessages([{
      role: 'system',
      text: 'Gemini conversation history has been reset. Starting a new session.',
    }])
  }


  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <div className="app">

      {/* ── Left panel: tools ── */}
      <aside className="sidebar">
        <p className="sidebar-label">available models</p>

        <div className="tools-container">
          {
            tools.map(tool => (
              <div
                key={tool.name}
                className={`tool-card ${activeTool === tool.name ? 'active' : ''}`}
                onClick={() => setActiveTool(tool.name)}
              >
                <strong>{tool.name}</strong>
                <p>{tool.description}</p>
              </div>
            ))
          }
        </div>

        <div className="sidebar-footer">
          <p>Status: <strong>Connected</strong></p>
          <p>Backend: <strong>C++ Server</strong></p>
        </div>
      </aside>

      {/* ── Right panel: chat ── */}
      <main className="chat">

        <header className="chat-header">
          <div className="active-tool-info">
            <span className="active-tool-dot"></span>
            <span className="active-tool-name">
              Active: {activeTool}
            </span>
          </div>
          {previousInteractionId && (
            <button className="reset-btn" onClick={handleReset} title="Reset session state">
              🔄 Reset Session
            </button>
          )}

          {prevChatMsgs && prevChatMsgs.length > 0 && (
            <button className="reset-btn" onClick={() => setShowPrevChat(!showPrevChat)} title="previous chat messages">
              {showPrevChat ? 'Hide Previous Chat' : 'Previous Chat'}
            </button>
          )}
        </header>

        <div className="messages">
          {showPrevChat && prevChatMsgs.map((msg, index) => {
            if (msg.role === 'system') {
              return (
                <div key={index} className="status-line" style={{ alignSelf: 'center', color: '#d6a2daff', animation: 'none' }}>
                  ⚙️ {msg.text}
                </div>
              )
            }
            return (
              <div key={index} className={`bubble ${msg.role}`}>
                <div className="bubble-label-wrapper">
                  <span className="bubble-label">
                    {msg.role === 'user' ? 'You' : `${msg.tool}`}
                  </span>
                </div>
                <span className="bubble-text">{msg.text}</span>
              </div>)
          })}
          {messages.length === 0 && (
            <div className="hint">
              <p>Chat statefully with <code>{activeTool}</code> directly.</p>
            </div>
          )}

          {!showPrevChat && messages.map((msg, index) => {
            if (msg.role === 'system') {
              return (
                <div key={index} className="status-line" style={{ alignSelf: 'center', color: '#d6a2daff', animation: 'none' }}>
                  ⚙️ {msg.text}
                </div>
              )
            }
            return (
              <div key={index} className={`bubble ${msg.role}`}>
                <div className="bubble-label-wrapper">
                  <span className="bubble-label">
                    {msg.role === 'user' ? 'You' : `${msg.tool}`}
                  </span>
                </div>
                <span className="bubble-text">{msg.text}</span>
              </div>
            )
          })}

          {!showPrevChat && status && (
            <div className="status-line">
              {status}...
            </div>
          )}


          <div ref={bottomRef} />
        </div>

        <div className="input-area">
          <input
            type="text"
            className="chat-input"
            placeholder={showPrevChat ? 'move to the current chat to continue chatting' : loading ? `${activeTool} is thinking ....` : `Ask ${activeTool} anything... (e.g. \"what is HAV team in siemens\")`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || showPrevChat}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={loading || !input.trim() || showPrevChat}
          >
            {loading || showPrevChat ? '...' : 'Send'}
          </button>
        </div>

      </main>
    </div>
  )
}
