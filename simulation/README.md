# Simulation & Consensus Engine

This module contains the core business logic for processing crowdsourced room reports. It is intentionally decoupled from the FastAPI web layer to allow isolated mathematical testing.

## Files & Structure

- **`logic_engine.py`**: The "Brain". Handles Trust Score calculations, gamification (rewards/penalties), and applies consensus rules (Pioneer Rule, VIP Overrides, Thresholds).
- **`simulation_integrated.py`**: A standalone CLI debugger. Runs a continuous loop of synthetic user reports to visually test the engine's behavior in the terminal.

## Usage (CLI Debugger)

To test the consensus logic locally without starting the full web server, run:

```bash
python src/simulation_integrated.py
```
