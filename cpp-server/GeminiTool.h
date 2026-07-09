#pragma once

#include "AgentTool.h"
#include "nlohmann/json.hpp"
#include <cstdlib>
#include <string>
#include <fstream>
#include <sstream>
#include <chrono>
#include <cstdio>
#include <memory>
#include <array>
#include <iostream>
#include <stdexcept>
#include <thread>

using json = nlohmann::json;

class GeminiTool : public AgentTool {

public:
    std::string model_name;
    GeminiTool(const std::string& model_name = "gemini-3.5-flash") : model_name(model_name) {}

private:
    std::string get_gemini_api_key() {
        char* env_key = std::getenv("GEMINI_API_KEY");
        if (env_key && std::string(env_key).length() > 0) {
            return std::string(env_key);
        }
        
        auto search_file = [](const std::string& path) -> std::string {
            std::ifstream file(path);
            if (!file.is_open()) return "";
            std::string line;
            while (std::getline(file, line)) {
                if (!line.empty() && line.back() == '\r') {
                    line.pop_back();
                }
                if (line.rfind("GEMINI_API_KEY=", 0) == 0) {
                    std::string val = line.substr(15);
                    if (val.length() >= 2 && val.front() == '"' && val.back() == '"') {
                        val = val.substr(1, val.length() - 2);
                    } else if (val.length() >= 2 && val.front() == '\'' && val.back() == '\'') {
                        val = val.substr(1, val.length() - 2);
                    }
                    return val;
                }
            }
            return "";
        };

        std::string key = search_file(".env");
        if (!key.empty()) return key;
        key = search_file("../.env");
        if (!key.empty()) return key;
        key = search_file("cpp-server/.env");
        if (!key.empty()) return key;
        
        return "";
    }

    std::string run_curl(const std::string& url, const std::string& post_data) {
        auto now = std::chrono::system_clock::now().time_since_epoch().count();
        std::string temp_filename = "gemini_req_" + std::to_string(now) + ".json";

        std::ofstream out(temp_filename);
        if (!out) {
            throw std::runtime_error("Failed to create temporary request file");
        }
        out << post_data;
        out.close();

        std::string cmd = "curl -s -X POST -H \"Content-Type: application/json\" -d @" + temp_filename + " \"" + url + "\"";

        std::string result;
        std::array<char, 256> buffer;
        
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) {
            std::remove(temp_filename.c_str());
            throw std::runtime_error("popen() failed to run curl");
        }

        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            result += buffer.data();
        }
        pclose(pipe);

        std::remove(temp_filename.c_str());
        return result;
    }

public:
    std::string name() const override {
        return model_name;
    }

    std::string description() const override {
        return "Conversational assistant powered by " + model_name + " and stateful interactions.";
    }

    void execute(
        const json& args,
        std::function<void(std::string)> send_status,
        std::function<void(json)> send_result
    ) override {
        send_status("Resolving Gemini API credentials...");
        std::string api_key = get_gemini_api_key();
        if (api_key.empty()) {
            throw std::runtime_error("GEMINI_API_KEY not found. Please define it in your environment or in a .env file.");
        }

        std::string input = "";
        if (args.contains("input") && !args["input"].is_null() && args["input"].is_string()) {
            input = args["input"].get<std::string>();
        }
        
        if (input.empty()) {
            throw std::runtime_error("Input prompt cannot be empty.");
        }

        std::string prev_id = "";
        if (args.contains("previous_interaction_id") && !args["previous_interaction_id"].is_null() && args["previous_interaction_id"].is_string()) {
            prev_id = args["previous_interaction_id"].get<std::string>();
        }

        send_status("Formulating request payload...");
        json payload;
        payload["model"] = model_name;
        payload["input"] = input;
        if (!prev_id.empty()) {
            payload["previous_interaction_id"] = prev_id;
        }

        std::string url = "https://generativelanguage.googleapis.com/v1beta/interactions?key=" + api_key;

        send_status("thinking");
        std::string response_str = run_curl(url, payload.dump());

        send_status("finalizing response...");
        std::this_thread::sleep_for(std::chrono::milliseconds(1200));

        try {
            json res = json::parse(response_str);

            if (res.contains("error")) {
                std::string errMsg = "Gemini API Error";
                if (res["error"].is_object() && res["error"].contains("message") && !res["error"]["message"].is_null()) {
                    errMsg += ": " + res["error"]["message"].get<std::string>();
                } else if (res["error"].is_string()) {
                    errMsg += ": " + res["error"].get<std::string>();
                }
                throw std::runtime_error(errMsg);
            }

            std::string new_interaction_id = "";
            if (res.contains("id") && !res["id"].is_null() && res["id"].is_string()) {
                new_interaction_id = res["id"].get<std::string>();
            }

            std::string full_text = "";
            if (res.contains("steps") && res["steps"].is_array()) {
                for (const auto& step : res["steps"]) {
                    if (step.contains("type") && step["type"] == "model_output") {
                        if (step.contains("content") && step["content"].is_array()) {
                            for (const auto& block : step["content"]) {
                                if (block.contains("type") && block["type"] == "text" && block.contains("text") && !block["text"].is_null() && block["text"].is_string()) {
                                    full_text += block["text"].get<std::string>();
                                }
                            }
                        }
                    }
                }
            }

            if (full_text.empty()) {
                full_text = "No text output returned from Gemini.";
            }

            json output;
            output["tool"] = name();
            output["text"] = full_text;
            output["interaction_id"] = new_interaction_id;

            send_result(output);

        } catch (const std::exception& e) {
            throw std::runtime_error(std::string("Error processing Gemini response: ") + e.what() + "\nRaw response: " + response_str);
        }
    }
};
