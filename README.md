# PySpur - An IDE for Inference-Time Compute

PySpur is an IDE that lets you develop, debug, and deploy inference-time compute pipelines.

https://github.com/user-attachments/assets/19cf6f99-6d66-45dc-911c-74025f87b1d2

# 🕸️ Why PySpur?

* Humans think for longer on difficult problems to improve their decisions.
* Similarly, we can enable LLMs to think for longer via computational graphs that involve multiple steps and feedback loops.
* However, such graphs involves intricate interdependencies among nodes, where the output of one node becomes the input for another.
* **The goal of PySpur is to enable developers to build, test, and deploy such LLM graphs by abstracting away the complexity of parallel execution and state management.**

# ✨ Core Benefits

1. **Develop with Inference-Time Compute Nodes**:
    * **High-level, batteries-included planners** (MCTS, Self-Refinement, BoN, ToT, etc.)
    * **Low-level primitives for parallel/sequential sampling** (cycles, routers, branchers, aggregators)
    * **Verifiers** (Code nodes, LLM-as-a-judge, software integrations, etc.)
2. **Debug with Evals**:
    * **Common reasoning benchmarks** (GSM8k, MATH, ARC, etc.)
    * **Scorers** via LLM-as-a-judge
    * **Custom datasets** via CSV, JSONL, HF Datasets
3. **Deploy for Batch Inference via Job Queue**:
    * **Submit/manage batch jobs via UI** for ease of use
    * **Self-hosting of async batch APIs** for full flexbility
    * **Fault tolerance and job persistence** for long-running jobs

# 🗺️ Roadmap

- [X] Canvas
- [X] ITC Nodes
- [X] Async/Batch Execution
- [ ] Templates
- [ ] Compile Spurs to Code
- [ ] ITC Node Monitoring
- [ ] New Nodes
    - [ ] Tools
    - [ ] Loops
    - [ ] Conditionals
- [ ] Evals
- [ ] Multimodal
- [ ] Spur API
- [ ] Containerization of Code Verifiers
- [ ] Leaderboard
- [ ] Generate Spurs via AI

Your feedback will be massively appreciated.
Please [tell us](mailto:founders@pyspur.com?subject=Feature%20Request&body=I%20want%20this%20feature%3Ai) which features on that list you like to see next or request entirely new ones.

# ⚡ Quick start

You can get PySpur up and running in three quick steps.

1. **Clone the repository:**
    ```sh
    git clone https://github.com/PySpur-com/PySpur.git
    cd pyspur
    ```

2. **Start the docker services:**

    ```sudo docker compose up --build -d```

    This will start a local instance of PySpur that will store spurs and their runs in a local SQLite file.

3. **Access the portal:**

    Go to `http://localhost:6080/` in your browser.

    Enter `pyspur`/`canaryhattan` as username/password.