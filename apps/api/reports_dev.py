"""Reports-only local test entry point; imports no History DB or sync workers."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from reports_api import router
from reports_body_limit import ReportsBodyLimit

app = FastAPI(title="Ado Fan Hub reports local test")
app.add_middleware(ReportsBodyLimit)
app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:8081", "http://127.0.0.1:8081"],
                   allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"])
app.include_router(router)
