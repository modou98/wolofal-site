with open("style.css", "a", encoding="utf-8") as f:
    f.write("""

/* Archive Layout */
.archive-container {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 2rem;
    align-items: start;
}

.archive-metadata-pane {
    background: var(--card-bg);
    padding: 2rem;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    position: sticky;
    top: 100px;
}

.scan-mockup {
    width: 100%;
    height: 300px;
    background: #e2e8f0;
    border: 2px dashed #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    border-radius: 8px;
    margin-top: 1rem;
}
[data-theme="dark"] .scan-mockup {
    background: #1e293b;
    border-color: #475569;
    color: #cbd5e1;
}

@media (max-width: 900px) {
    .archive-container {
        grid-template-columns: 1fr;
    }
    .archive-metadata-pane {
        position: static;
    }
}
""")
