#include <whisper.h>
#include <nlohmann/json.hpp>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <intrin.h>
#endif

using json = nlohmann::json;
using Clock = std::chrono::steady_clock;
constexpr size_t max_pcm = 3840000;
std::atomic<bool> aborted{false}, closing{false};
std::mutex gate, output_gate;
std::condition_variable wake;
json job;
std::vector<unsigned char> audio;
std::string active_id;
bool pending = false;

void send(json value) {
    value["version"] = 1;
    const std::string encoded = value.dump();
    if (encoded.size() > 65536) std::_Exit(3);
    std::lock_guard<std::mutex> lock(output_gate);
    const auto n = static_cast<uint32_t>(encoded.size());
    unsigned char prefix[4] = {static_cast<unsigned char>(n), static_cast<unsigned char>(n >> 8), static_cast<unsigned char>(n >> 16), static_cast<unsigned char>(n >> 24)};
    const char zero[4] = {};
    std::cout.write(reinterpret_cast<char*>(prefix), 4);
    std::cout.write(encoded.data(), encoded.size());
    std::cout.write(zero, 4);
    std::cout.flush();
    if (!std::cout) std::_Exit(0);
}
void error(const std::string& id, const std::string& code) {
    send({{"kind", "error"}, {"requestId", id}, {"code", code}});
}
bool read_exact(char* target, size_t count) {
    return static_cast<bool>(std::cin.read(target, count));
}
uint32_t length() {
    unsigned char b[4];
    if (!read_exact(reinterpret_cast<char*>(b), 4)) throw std::runtime_error("eof");
    return uint32_t(b[0]) | uint32_t(b[1]) << 8 | uint32_t(b[2]) << 16 | uint32_t(b[3]) << 24;
}
bool uuid(const json& v) {
    if (!v.is_string()) return false;
    const auto s = v.get<std::string>();
    if (s.size() != 36) return false;
    for (size_t i = 0; i < s.size(); ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) { if (s[i] != '-') return false; }
        else if (!std::isxdigit(static_cast<unsigned char>(s[i]))) return false;
    }
    return true;
}
void keys(const json& j, std::initializer_list<const char*> expected) {
    if (!j.is_object() || j.size() != expected.size()) throw std::runtime_error("schema");
    for (auto key : expected) if (!j.contains(key)) throw std::runtime_error("schema");
}
void validate(const json& j, size_t bytes) {
    if (!j.is_object() || !j.contains("version") || j["version"] != 1 || !j.contains("kind") || !j["kind"].is_string()) throw std::runtime_error("schema");
    const auto kind = j["kind"].get<std::string>();
    if (kind == "shutdown") { keys(j, {"version", "kind"}); if (bytes) throw std::runtime_error("payload"); return; }
    if (!j.contains("requestId") || !uuid(j["requestId"])) throw std::runtime_error("id");
    if (kind == "cancel") keys(j, {"version", "kind", "requestId"});
    else if (kind == "load") {
        keys(j, {"version", "kind", "requestId", "modelId", "modelPath", "vadPath", "backend", "threads"});
        if (j["modelId"] != "base.en" && j["modelId"] != "large-v3-turbo") throw std::runtime_error("model");
        if (j["backend"] != "cpu") throw std::runtime_error("backend");
        if (!j["threads"].is_number_integer() || j["threads"] < 1 || j["threads"] > 16) throw std::runtime_error("threads");
        for (auto key : {"modelPath", "vadPath"}) {
            if (!j[key].is_string()) throw std::runtime_error("path");
            const auto path = j[key].get<std::string>();
            if (path.empty() || path.size() > 4096 || path.find('\0') != std::string::npos) throw std::runtime_error("path");
        }
    } else if (kind == "transcribe") {
        keys(j, {"version", "kind", "requestId", "language", "sampleRate", "sampleCount"});
        if (j["language"] != "en" && j["language"] != "auto") throw std::runtime_error("language");
        if (j["sampleRate"] != 16000 || !j["sampleCount"].is_number_unsigned() || j["sampleCount"].get<size_t>() * 2 != bytes || bytes < 9600 || bytes > max_pcm || bytes % 2) throw std::runtime_error("pcm");
    } else throw std::runtime_error("kind");
    if (kind != "transcribe" && bytes) throw std::runtime_error("payload");
}

// stdin EOF also starts an independent hard-exit deadline: initialization need not cooperate.
void stop_process() {
    closing = true;
    aborted = true;
    wake.notify_all();
    std::thread([] { std::this_thread::sleep_for(std::chrono::milliseconds(1500)); std::_Exit(0); }).detach();
}
void reader() {
    try {
        while (!closing) {
            const auto size = length();
            if (size == 0 || size > 32768) throw std::runtime_error("size");
            std::string raw(size, '\0');
            if (!read_exact(raw.data(), size)) throw std::runtime_error("eof");
            std::set<std::string> seen;
            bool duplicate = false;
            const auto j = json::parse(raw, [&](int, json::parse_event_t event, json& value) {
                if (event == json::parse_event_t::key && !seen.insert(value.get<std::string>()).second) duplicate = true;
                return true;
            });
            if (duplicate) throw std::runtime_error("duplicate");
            const auto count = length();
            if (count > max_pcm) throw std::runtime_error("size");
            validate(j, count);
            std::vector<unsigned char> pcm(count);
            if (count && !read_exact(reinterpret_cast<char*>(pcm.data()), count)) throw std::runtime_error("eof");
            if (j["kind"] == "shutdown") break;
            std::lock_guard<std::mutex> lock(gate);
            const auto id = j["requestId"].get<std::string>();
            if (j["kind"] == "cancel") { if (id == active_id) aborted = true; continue; }
            if (!active_id.empty()) throw std::runtime_error("busy");
            active_id = id;
            aborted = false;
            job = j;
            audio = std::move(pcm);
            pending = true;
            wake.notify_one();
        }
    } catch (...) { /* No raw protocol data or paths are logged. */ }
    stop_process();
}

// Use the loader API with wide paths: upstream narrow fopen cannot open every Windows username.
struct ModelFile {
    FILE* file = nullptr;
    explicit ModelFile(const std::string& path) {
#ifdef _WIN32
        int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.c_str(), -1, nullptr, 0);
        if (n <= 0) return;
        std::wstring wide(n, L'\0');
        MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.c_str(), -1, wide.data(), n);
        _wfopen_s(&file, wide.c_str(), L"rb");
#else
        file = fopen(path.c_str(), "rb");
#endif
    }
    ~ModelFile() { if (file) fclose(file); }
    whisper_model_loader loader() {
        return {this,
            [](void* p, void* out, size_t n) { return fread(out, 1, n, static_cast<ModelFile*>(p)->file); },
            [](void* p) { return feof(static_cast<ModelFile*>(p)->file) != 0; },
            [](void*) {}};
    }
};

int main() {
#if defined(COMPUTERCAT_AVX2) && defined(_WIN32)
    int cpu[4]; __cpuid(cpu, 1);
    const unsigned required = (1u<<27) | (1u<<28) | (1u<<12) | (1u<<29);
    if ((static_cast<unsigned>(cpu[2]) & required) != required || (_xgetbv(0) & 6) != 6) return 86;
    __cpuidex(cpu, 7, 0);
    if ((cpu[1] & (1<<5)) == 0 || (cpu[1] & (1<<8)) == 0) return 86;
#endif
#ifdef _WIN32
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_APPLICATION_DIR);
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    whisper_log_set([](ggml_log_level, const char*, void*) {}, nullptr);
    send({{"kind", "hello"}, {"buildId", "computercat-whisper-1"}, {"engine", "1.9.4"}, {"backend", "cpu"}});
    std::thread input(reader);
    whisper_context* ctx = nullptr;
    whisper_vad_context* vad = nullptr;
    int threads = 1;
    std::string model;
    while (true) {
        json request;
        std::vector<unsigned char> pcm;
        {
            std::unique_lock<std::mutex> lock(gate);
            wake.wait(lock, [] { return closing || pending; });
            if (closing) break;
            request = job;
            pcm = std::move(audio);
            pending = false;
        }
        const auto id = request["requestId"].get<std::string>();
        const auto started = Clock::now();
        auto elapsed = [&] { return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - started).count(); };
        json response;
        try {
#ifdef COMPUTERCAT_TEST_ENGINE
            if (request["kind"] == "load" && request["modelPath"] == "hang") {
                while (!closing) std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
            for (int i = 0; i < 50 && !aborted && !closing; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
            if (request["kind"] == "load") response = {{"kind", "ready"}, {"modelId", request["modelId"]}, {"backend", "cpu"}, {"loadMs", elapsed()}};
            else response = {{"kind", "result"}, {"text", "fixture"}, {"language", "en"}, {"audioMs", pcm.size()/32}, {"inferenceMs", elapsed()}};
#else
            if (request["kind"] == "load") {
                if (ctx) { whisper_free(ctx); ctx = nullptr; }
                if (vad) { whisper_vad_free(vad); vad = nullptr; }
                threads = request["threads"];
                model = request["modelId"];
                auto params = whisper_context_default_params();
                params.use_gpu = false;
                ModelFile mf(request["modelPath"]);
                if (!mf.file) throw std::runtime_error("model-load-failed");
                auto loader = mf.loader();
                ctx = whisper_init_with_params(&loader, params);
                if (!ctx) throw std::runtime_error("model-load-failed");
                if (!aborted) {
                    ModelFile vf(request["vadPath"]);
                    if (!vf.file) throw std::runtime_error("model-load-failed");
                    auto vl = vf.loader();
                    auto vp = whisper_vad_default_context_params();
                    vp.use_gpu = false;
                    vp.n_threads = threads;
                    vad = whisper_vad_init_with_params(&vl, vp);
                    if (!vad) throw std::runtime_error("model-load-failed");
                }
                response = {{"kind", "ready"}, {"modelId", model}, {"backend", "cpu"}, {"loadMs", elapsed()}};
            } else {
                if (!ctx || !vad) throw std::runtime_error("model-load-failed");
                if (model == "base.en" && request["language"] != "en") throw std::runtime_error("protocol-error");
                std::vector<float> samples(pcm.size() / 2);
                for (size_t i = 0; i < samples.size(); ++i) {
                    auto u = uint16_t(pcm[2*i]) | uint16_t(pcm[2*i+1]) << 8;
                    samples[i] = static_cast<int16_t>(u) / 32768.f;
                }
                pcm.clear();
                if (!whisper_vad_detect_speech(vad, samples.data(), static_cast<int>(samples.size()))) throw std::runtime_error("model-load-failed");
                auto vp = whisper_vad_default_params();
                vp.min_speech_duration_ms = 100;
                auto* segments = whisper_vad_segments_from_probs(vad, vp);
                const bool speech = segments && whisper_vad_segments_n_segments(segments) > 0;
                if (segments) whisper_vad_free_segments(segments);
                if (!speech) response = {{"kind", "no-speech"}};
                else if (!aborted) {
                    auto p = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
                    p.n_threads = threads;
                    p.translate = false;
                    p.no_context = true;
                    p.no_timestamps = true;
                    p.print_realtime = p.print_progress = p.print_timestamps = p.print_special = false;
                    std::string language = request["language"];
                    p.language = language.c_str();
                    p.abort_callback = [](void*) { return aborted.load() || closing.load(); };
                    p.abort_callback_user_data = nullptr;
                    p.encoder_begin_callback = [](whisper_context*, whisper_state*, void*) { return !aborted.load() && !closing.load(); };
                    if (whisper_full(ctx, p, samples.data(), static_cast<int>(samples.size())) != 0 && !aborted) throw std::runtime_error("model-load-failed");
                    std::string text;
                    for (int i = 0; !aborted && i < whisper_full_n_segments(ctx); ++i) {
                        text += whisper_full_get_segment_text(ctx, i);
                        if (text.size() > 24000) throw std::runtime_error("text-too-long");
                    }
                    response = {{"kind", "result"}, {"text", text}, {"language", whisper_lang_str(whisper_full_lang_id(ctx))}, {"audioMs", samples.size() / 16}, {"inferenceMs", elapsed()}};
                }
            }
#endif
        } catch (const std::exception& ex) {
            std::string code = ex.what();
            if (code != "model-load-failed" && code != "text-too-long" && code != "protocol-error") code = "model-load-failed";
            response = {{"kind", "error"}, {"code", code}};
        }
        // Publish and release ownership under the same gate as new commands/cancel.
        {
            std::lock_guard<std::mutex> lock(gate);
            if (aborted) response = {{"kind", "cancelled"}};
            response["requestId"] = id;
            if (!closing) send(response);
            active_id.clear();
        }
    }
    if (ctx) whisper_free(ctx);
    if (vad) whisper_vad_free(vad);
    input.join();
    return 0;
}
