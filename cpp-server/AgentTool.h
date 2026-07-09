#pragma once
#include <string>
#include <functional>
#include "nlohmann/json.hpp"

// ─────────────────────────────────────────────────────────────────────────────
// AgentTool – Abstract Base Class
//
// Every tool must inherit from this and implement:
//   name()    → the string key used in JSON requests ("FileScanner", etc.)
//   execute() → runs the tool and communicates back via two callbacks:
//
//     send_status(message)  → stream a progress update to the UI (called many times)
//     send_result(json)     → send the final result object (called once, at the end)
//
// The two-callback design lets the tool stream real-time status messages while
// it is still working, before it has the final answer ready.
// ─────────────────────────────────────────────────────────────────────────────

class AgentTool {
public:
    // Returns the unique name of this tool (used to route incoming WS requests)
    virtual std::string name() const = 0;

    // Returns a short human-readable description (sent to UI for the side panel)
    virtual std::string description() const = 0;

    // Execute the tool.
    //   args        – the "args" object from the incoming JSON request
    //   send_status – call this to stream a status string to the UI
    //   send_result – call this once with the final JSON result
    virtual void execute(
        const nlohmann::json& args,
        std::function<void(std::string)> send_status,
        std::function<void(nlohmann::json)> send_result
    ) = 0;

    // Virtual destructor so unique_ptr cleanup works correctly
    virtual ~AgentTool() = default;
};
