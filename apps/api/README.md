# Ado Fan Hub API

FastAPI backend for the unofficial Ado Fan Hub project.

## Requirements

- Python 3.12

## Setup (Windows PowerShell)

1. Create a virtual environment:

   py -3.12 -m venv .venv

2. Install dependencies:

   .\.venv\Scripts\python.exe -m pip install -r requirements.txt

## Run

   .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

## Endpoints

- GET /health - API health check
- GET /docs - Interactive API documentation

## Disclaimer

This is an unofficial fan project and is not affiliated with Ado.
