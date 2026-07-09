// ─────────────────────────────────────────────────────────────────────────────
// Lumina C++ WebSocket Server – main.cpp
//
// What this file does:
//   1. Builds a tool registry (map of name → unique_ptr<AgentTool>)
//   2. Starts an HTTP/WebSocket server on localhost:8765
//   3. Handles GET /tools  → returns JSON list of available tools
//   4. Handles WS  /ws     → receives tool requests, streams status + result
//
// WebSocket message protocol (all JSON):
//
//   Incoming request (from Electron):
//     { "id": "<uuid>", "tool": "AddNumbers", "args": { "a": 5, "b": 3 } }
//
//   Outgoing status frame (many per request):
//     { "id": "<uuid>", "type": "status", "data": "Scanning..." }
//
//   Outgoing result frame (one per request, signals completion):
//     { "id": "<uuid>", "type": "result", "data": { ...tool output... } }
//
//   Outgoing error frame:
//     { "id": "<uuid>", "type": "error",  "data": "Tool not found: Foo" }
// ─────────────────────────────────────────────────────────────────────────────

#include <iostream>
#include <map>
#include <memory>
#include <string>

// Header-only libraries (vendored in this directory)
#include "httplib.h"
#include "nlohmann/json.hpp"

// Tool implementations
#include "AgentTool.h"
#include "GeminiTool.h"

using json = nlohmann::json;

// ── Tool Registry ─────────────────────────────────────────────────────────────
// We store tools in a map by their name string.
// unique_ptr means no manual delete – memory is freed when the map is destroyed.
using ToolRegistry = std::map<std::string, std::unique_ptr<AgentTool>>;

ToolRegistry build_registry() {
    ToolRegistry registry;

    // Register each tool – ownership is transferred via std::move
    // To add a new tool: just add one more line here
    registry["gemini-3.5-flash"] = std::make_unique<GeminiTool>("gemini-3.5-flash");
    registry["gemini-3.1-pro-preview"] = std::make_unique<GeminiTool>("gemini-3.1-pro-preview");
    registry["gemini-3.1-flash-lite"] = std::make_unique<GeminiTool>("gemini-3.1-flash-lite");
    registry["gemini-3-flash-preview"] = std::make_unique<GeminiTool>("gemini-3-flash-preview");
    registry["gemini-2.5-pro"] = std::make_unique<GeminiTool>("gemini-2.5-pro");
    registry["gemini-2.5-flash"] = std::make_unique<GeminiTool>("gemini-2.5-flash");
    registry["gemini-2.5-flash-lite"] = std::make_unique<GeminiTool>("gemini-2.5-flash-lite");
    
    return registry;
}

// ── Helper: build a JSON frame to send over the WebSocket ─────────────────────
std::string make_frame(const std::string& id, const std::string& type, const json& data) {
    json frame;
    frame["id"]   = id;
    frame["type"] = type;
    frame["data"] = data;
    return frame.dump();
}

// ── Main ──────────────────────────────────────────────────────────────────────
int main() {
    // Build the tool registry once at startup
    ToolRegistry registry = build_registry();

    httplib::Server svr;

    // ── GET /tools ─────────────────────────────────────────────────────────────
    // Returns a JSON array describing all registered tools.
    // Called once by Electron on startup to populate the sidebar.
    svr.Get("/tools", [&](const httplib::Request&, httplib::Response& res) {
        json tools_list = json::array();
        for (const auto& [key, tool] : registry) {
            json t;
            t["name"]        = tool->name();
            t["description"] = tool->description();
            tools_list.push_back(t);
        }
        res.set_content(tools_list.dump(), "application/json");
        // Allow cross-origin requests from the Electron renderer
        res.set_header("Access-Control-Allow-Origin", "*");
    });

    // ── WebSocket /ws ──────────────────────────────────────────────────────────
    // Each connected client (Electron main process) sends tool-call requests.
    // We execute the requested tool and stream back status + result frames.
    svr.WebSocket("/ws", [&](const httplib::Request&, httplib::ws::WebSocket& ws) {
        std::cout << "[WS] Client connected\n";

        std::string raw_msg;
        // read() blocks until a message arrives or the connection closes
        while (ws.read(raw_msg)) {
            std::string request_id = "?";
            try {
                // ── Parse incoming JSON ──────────────────────────────────────
                json req = json::parse(raw_msg);
                request_id         = req.value("id",   "unknown");
                std::string tool_name = req.value("tool", "");
                json args          = req.value("args", json::object());

                std::cout << "[WS] Request id=" << request_id
                          << " tool=" << tool_name << "\n";

                // ── Look up tool ─────────────────────────────────────────────
                auto it = registry.find(tool_name);
                if (it == registry.end()) {
                    ws.send(make_frame(request_id, "error",
                                       "Tool not found: " + tool_name));
                    continue;
                }

                AgentTool* tool = it->second.get();

                // ── Build callbacks ──────────────────────────────────────────
                // Each callback serializes a JSON frame and sends it over WS.
                // ws.send() is thread-safe within the same handler invocation.

                auto send_status = [&](std::string msg) {
                    std::string frame = make_frame(request_id, "status", msg);
                    std::cout << "[WS] Status: " << msg << "\n";
                    ws.send(frame);
                };

                auto send_result = [&](json result) {
                    std::string frame = make_frame(request_id, "result", result);
                    std::cout << "[WS] Result sent for id=" << request_id << "\n";
                    ws.send(frame);
                };

                // ── Execute the tool ─────────────────────────────────────────
                // This is synchronous – status callbacks fire during execution,
                // streaming updates to the client in real time.
                tool->execute(args, send_status, send_result);

            } catch (const json::parse_error& e) {
                ws.send(make_frame(request_id, "error",
                                   std::string("JSON parse error: ") + e.what()));
            } catch (const std::exception& e) {
                ws.send(make_frame(request_id, "error",
                                   std::string("Exception: ") + e.what()));
            }
        }

        std::cout << "[WS] Client disconnected\n";
    });

    std::cout << "=== Lumina C++ Server starting on ws://localhost:8765 ===\n";
    std::cout << "    GET  /tools  → list available tools\n";
    std::cout << "    WS   /ws     → tool execution endpoint\n";
    svr.listen("localhost", 8765);

    return 0;
}
