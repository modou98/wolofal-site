// App Logic
const app = {
    state: {
        isDark: false,
        searchQuery: '',
        fontSize: window.innerWidth <= 768 ? 1.05 : 1.4,
        isZen: false,
        currentView: 'home',
        currentAuthorId: null,
        currentPoemId: null,
        activeHighlightIndex: -1,
        totalHighlights: 0,
        contentLoaded: false
    },

    init: () => {
        // Init theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            app.toggleTheme(true);
        }

        // Escape key to toggle/exit Zen mode
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && app.state.isZen) {
                app.toggleZen();
            }
        });

        // Route via l'URL (hash) pour permettre les liens directs et le bouton retour
        window.addEventListener('hashchange', () => {
            const { view, param } = app.parseHash();
            app.render(view, param);
        });

        const { view, param } = app.parseHash();
        app.render(view, param);

        app.loadContents();
    },

    // Charge le texte des poèmes en arrière-plan et le fusionne dans authorsData.
    // Le premier rendu (galerie, bios, titres) n'attend pas ce chargement.
    loadContents: async () => {
        try {
            const res = await fetch('data/poemes_content.json?v=12');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contents = await res.json();
            authorsData.forEach(author => {
                author.poems.forEach(poem => {
                    if (contents[poem.id] !== undefined) {
                        poem.content = contents[poem.id];
                    }
                });
            });
            app.state.contentLoaded = true;
            // Si un poème était affiché en attente de son texte, on le re-rend
            if (app.state.currentView === 'reader') {
                app.render('reader', app.state.currentPoemId);
            }
        } catch (e) {
            console.error('Impossible de charger le texte des poèmes :', e);
        }
    },

    routeToHash: (view, param) => {
        if (view === 'author') return `#/auteur/${param}`;
        if (view === 'reader') return `#/poeme/${encodeURIComponent(param)}`;
        return '#/';
    },

    parseHash: () => {
        const hash = window.location.hash.replace(/^#\/?/, '');
        const parts = hash.split('/').filter(Boolean);
        if (parts[0] === 'auteur' && parts[1]) {
            return { view: 'author', param: parseInt(parts[1], 10) };
        }
        if (parts[0] === 'poeme' && parts[1]) {
            return { view: 'reader', param: decodeURIComponent(parts[1]) };
        }
        return { view: 'home', param: null };
    },

    toggleTheme: (forceDark = false) => {
        app.state.isDark = forceDark ? true : !app.state.isDark;
        document.documentElement.setAttribute('data-theme', app.state.isDark ? 'dark' : 'light');
        localStorage.setItem('theme', app.state.isDark ? 'dark' : 'light');
        const btn = document.getElementById('themeToggle');
        if (btn) btn.textContent = app.state.isDark ? '☀️' : '🌙';
    },

    handleSearch: (e) => {
        app.state.searchQuery = e.target.value.toLowerCase();
        
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
            clearBtn.style.display = app.state.searchQuery ? 'block' : 'none';
        }
        
        if (app.state.currentView === 'reader') {
            let poem = null;
            for (const a of authorsData) {
                const p = a.poems.find(p => p.id === app.state.currentPoemId);
                if (p) {
                    poem = p;
                    break;
                }
            }
            if (poem && poem.content !== undefined) {
                const { parsedContent } = app.parsePoemContent(poem.content, app.state.searchQuery, poem.stanzaSize || 2);
                const poemContentEl = document.getElementById('poemContent');
                if (poemContentEl) {
                    poemContentEl.innerHTML = parsedContent;
                    
                    if (app.state.searchQuery && app.state.totalHighlights > 0) {
                        app.setActiveHighlight(0);
                    } else {
                        app.state.activeHighlightIndex = -1;
                        app.state.totalHighlights = 0;
                        app.updateMatchCounter();
                    }
                }
            }
        } else if (app.state.currentView === 'author') {
            app.renderAuthor(document.getElementById('app'), app.state.currentAuthorId);
        } else {
            app.renderHome(document.getElementById('app'));
        }
    },

    clearSearch: () => {
        app.state.searchQuery = '';
        const input = document.getElementById('searchInput');
        if (input) input.value = '';
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.style.display = 'none';
        
        app.state.activeHighlightIndex = -1;
        app.state.totalHighlights = 0;
        
        if (app.state.currentView === 'reader') {
            let poem = null;
            for (const a of authorsData) {
                const p = a.poems.find(p => p.id === app.state.currentPoemId);
                if (p) {
                    poem = p;
                    break;
                }
            }
            if (poem && poem.content !== undefined) {
                const { parsedContent } = app.parsePoemContent(poem.content, '', poem.stanzaSize || 2);
                const poemContentEl = document.getElementById('poemContent');
                if (poemContentEl) poemContentEl.innerHTML = parsedContent;
            }
            app.updateMatchCounter();
        } else if (app.state.currentView === 'author') {
            app.renderAuthor(document.getElementById('app'), app.state.currentAuthorId);
        } else {
            app.renderHome(document.getElementById('app'));
        }
    },

    navigateHighlight: (direction) => {
        if (app.state.totalHighlights === 0) return;
        
        let nextIndex = app.state.activeHighlightIndex + direction;
        if (nextIndex >= app.state.totalHighlights) nextIndex = 0;
        if (nextIndex < 0) nextIndex = app.state.totalHighlights - 1;
        
        app.setActiveHighlight(nextIndex);
    },

    setActiveHighlight: (index) => {
        app.state.activeHighlightIndex = index;
        app.updateMatchCounter();
        
        const container = document.getElementById('poemContent');
        if (!container) return;
        
        // Reset all highlights to default soft color
        container.querySelectorAll('.dynamic-highlight').forEach(el => {
            el.classList.remove('active-match');
        });
        
        const activeEl = container.querySelector(`.dynamic-highlight[data-index="${index}"]`);
        if (activeEl) {
            activeEl.classList.add('active-match');
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    updateMatchCounter: () => {
        const nav = document.getElementById('searchNavigator');
        const counter = document.getElementById('matchCounter');
        if (!nav || !counter) return;
        
        if (app.state.searchQuery && app.state.totalHighlights > 0) {
            nav.style.display = 'flex';
            counter.textContent = `${app.state.activeHighlightIndex + 1} / ${app.state.totalHighlights}`;
        } else {
            nav.style.display = 'none';
        }
    },

    navigate: (view, param = null) => {
        const newHash = app.routeToHash(view, param);
        if (window.location.hash === newHash) {
            app.render(view, param);
        } else {
            window.location.hash = newHash;
        }
    },

    render: (view, param = null) => {
        app.state.currentView = view;
        const container = document.getElementById('app');
        window.scrollTo(0, 0);

        // Reset Zen mode on navigation
        if (app.state.isZen) app.toggleZen();

        // Update search clear button visibility
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
            clearBtn.style.display = app.state.searchQuery ? 'block' : 'none';
        }

        if (view === 'home') {
            document.title = "Wolofal Heritage - Accueil";
            app.renderHome(container);
        } else if (view === 'author') {
            app.state.currentAuthorId = param;
            app.renderAuthor(container, param);
        } else if (view === 'reader') {
            app.state.currentPoemId = param;
            app.renderReader(container, param);
        }
    },

    renderHome: (container) => {
        const query = app.state.searchQuery;

        if (query) {
            let matchingPoems = [];
            authorsData.forEach(author => {
                const authorMatches = author.name.toLowerCase().includes(query);
                author.poems.forEach(poem => {
                    const titleMatches = poem.title.toLowerCase().includes(query);
                    const excerptMatches = poem.excerpt && poem.excerpt.toLowerCase().includes(query);
                    const contentMatches = poem.content && poem.content.toLowerCase().includes(query);
                    
                    if (authorMatches || titleMatches || excerptMatches || contentMatches) {
                        matchingPoems.push({
                            ...poem,
                            authorName: author.name,
                            authorId: author.id
                        });
                    }
                });
            });

            matchingPoems.sort((a, b) => a.title.localeCompare(b.title));

            const poemsHtml = matchingPoems.map(poem => {
                const snippet = app.getSearchSnippet(poem.content, query);
                return `
                <div class="search-poem-card" onclick="app.navigate('reader', '${poem.id}')">
                    <div style="display: flex; flex-direction: column; gap: 0.25rem; text-align: left; width: 100%;">
                        <span class="poem-title" style="font-size: 1.3rem;">${poem.title}</span>
                        <span class="poem-author" style="font-size: 0.9rem; color: var(--accent-color); font-weight: 500;">par ${poem.authorName}</span>
                        ${poem.excerpt ? `<span class="poem-excerpt">${poem.excerpt}</span>` : ''}
                        ${snippet ? `<div class="poem-snippet">${snippet}</div>` : ''}
                    </div>
                    <span class="poem-meta" style="white-space: nowrap; margin-left: 1rem;">Lire &rarr;</span>
                </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="gallery-header">
                    <h1>Résultats de recherche</h1>
                    <p>${matchingPoems.length} poème(s) trouvé(s) pour "${query}"</p>
                </div>
                <div class="search-results" style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; width: 100%;">
                    ${poemsHtml || `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            <line x1="11" y1="8" x2="11" y2="14"></line>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                        <h3>Aucun poème trouvé</h3>
                        <p>Nous n'avons trouvé aucun poème correspondant à "${query}". Vérifiez l'orthographe ou essayez un autre mot-clé.</p>
                        <button class="ctrl-btn" onclick="app.clearSearch()" style="margin-top: 1rem; font-weight: 600;">Réinitialiser la recherche</button>
                    </div>
                    `}
                </div>
            `;
        } else {
            const authorsHtml = authorsData.map(author => `
                <div class="author-card" onclick="app.navigate('author', ${author.id})">
                    <div class="card-image" ${author.image ? `role="img" aria-label="Portrait de ${author.name}"` : 'aria-hidden="true"'} style="${author.image ? `background-image: url('${author.image}'); background-size: cover; background-position: top;` : ''}">
                        ${!author.image ? `<span>${app.getInitials(author.name)}</span>` : ''}
                    </div>
                    <div class="card-content">
                        <h3>${author.name}</h3>
                        <p>${author.shortBio}</p>
                    </div>
                </div>
            `).join('');

            container.innerHTML = `
                <div class="gallery-header">
                    <h1>Les Grands Auteurs</h1>
                    <p>Découvrez les voix qui ont façonné la littérature Wolofal.</p>
                </div>

                <div class="authors-grid">
                    ${authorsHtml || '<p style="text-align:center; grid-column: 1/-1;">Aucun résultat trouvé.</p>'}
                </div>
            `;
        }
    },

    renderAuthor: (container, authorId) => {
        const author = authorsData.find(a => a.id === authorId);
        if (!author) return;

        document.title = `${author.name} | Wolofal Heritage`;

        const query = app.state.searchQuery;
        const poems = query ? author.poems.filter(p => {
            const titleMatches = p.title.toLowerCase().includes(query);
            const excerptMatches = p.excerpt && p.excerpt.toLowerCase().includes(query);
            const contentMatches = p.content && p.content.toLowerCase().includes(query);
            return titleMatches || excerptMatches || contentMatches;
        }) : [...author.poems];
        poems.sort((a, b) => a.title.localeCompare(b.title));

        const poemsHtml = poems.map(poem => {
            const snippet = query ? app.getSearchSnippet(poem.content, query) : '';
            return `
            <div class="poem-item" onclick="app.navigate('reader', '${poem.id}')" style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <span class="poem-title" style="font-size: 1.3rem;">${poem.title}</span>
                    <span class="poem-meta" style="white-space: nowrap; margin-left: 1rem;">Lire &rarr;</span>
                </div>
                ${poem.excerpt ? `<span class="poem-excerpt">${poem.excerpt}</span>` : ''}
                ${snippet ? `<div class="poem-snippet" style="width: 100%;">${snippet}</div>` : ''}
            </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="author-view">
                <button class="back-button" onclick="app.navigate('home')">
                    &larr; Retour à la galerie
                </button>
                <div class="author-header">
                    <div class="author-portrait" ${author.image ? `role="img" aria-label="Portrait de ${author.name}"` : 'aria-hidden="true"'} style="${author.image ? `background-image: url('${author.image}'); background-size: cover; background-position: top;` : ''}"></div>
                    <div class="author-info">
                        <h1>${author.name}</h1>
                        <div class="author-bio">${author.fullBio.replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
                <div class="poems-list">
                    <h2>Œuvres Disponibles</h2>
                    <div class="poems-grid">
                        ${poemsHtml || '<p>Aucun poème trouvé.</p>'}
                    </div>
                </div>
            </div>
        `;
    },

    renderReader: (container, poemId) => {
        let poem = null;
        let author = null;

        for (const a of authorsData) {
            const p = a.poems.find(p => p.id === poemId);
            if (p) {
                poem = p;
                author = a;
                break;
            }
        }

        if (!poem) return;

        // Le texte est chargé en async : si pas encore là, on affiche une attente
        // et loadContents() re-rendra la vue une fois le JSON arrivé.
        if (poem.content === undefined) {
            document.title = `${poem.title} - par ${author.name} | Wolofal Heritage`;
            container.innerHTML = `
                <div class="reader-view" style="max-width: 1200px; text-align: center; padding: 4rem 1rem;">
                    <p style="opacity: 0.7;">Chargement du texte…</p>
                </div>
            `;
            return;
        }

        const { parsedContent, tocHtml } = app.parsePoemContent(poem.content, app.state.searchQuery, poem.stanzaSize || 2);

        document.title = `${poem.title} - par ${author.name} | Wolofal Heritage`;

        container.innerHTML = `
            <div class="reader-view" style="max-width: 1200px;">
                <div class="reader-top-bar">
                    <button class="back-button" style="margin-bottom:0;" onclick="app.navigate('author', ${author.id})">
                        &larr; Retour à ${author.name}
                    </button>
                    
                    <!-- Navigateur de recherche (Ctrl+F) -->
                    <div id="searchNavigator" class="search-navigator" style="display: none; align-items: center; gap: 0.5rem;">
                        <span id="matchCounter" style="font-size: 0.9rem; color: var(--text-color); font-weight: 500;">0 / 0</span>
                        <button class="ctrl-btn nav-arrow" onclick="app.navigateHighlight(-1)" style="padding: 0.25rem 0.6rem; font-weight: bold;">&larr;</button>
                        <button class="ctrl-btn nav-arrow" onclick="app.navigateHighlight(1)" style="padding: 0.25rem 0.6rem; font-weight: bold;">&rarr;</button>
                    </div>
                    
                    <div class="controls" style="margin-bottom:0; display: flex; align-items: center; gap: 0.5rem;">
                        <button class="ctrl-btn" onclick="app.toggleZen()">🧘 Mode Zen</button>
                        <button class="ctrl-btn" onclick="app.changeFontSize(-0.1)">A-</button>
                        <span id="fontSizeIndicator" style="font-size: 0.9rem; font-weight: 600; min-width: 45px; text-align: center; color: var(--text-color);">${Math.round(app.state.fontSize * 100)}%</span>
                        <button class="ctrl-btn" onclick="app.changeFontSize(0.1)">A+</button>
                    </div>
                </div>

                <div class="archive-container">
                    <div class="archive-metadata-pane">
                        <div class="reader-header" style="margin-bottom:2rem; text-align:left;">
                            <h1 class="reader-title" style="font-size:2.5rem;">${poem.title}</h1>
                            <div class="reader-author">par ${author.name}</div>
                        </div>
                        
                        <div class="archive-info" style="margin-bottom:2rem; font-size:0.95rem; color:var(--text-color); opacity:0.8; line-height:1.6;">
                            <p><strong>Source :</strong> Manuscrit numérique</p>
                            <p><strong>Langue :</strong> Wolofal (Ajami)</p>
                            <p><strong>Format :</strong> Transcription dynamique</p>
                        </div>
                        
                        ${tocHtml}

                        ${poem.audio ? app.renderAudio(poem.audio) : ''}
                        
                        ${poem.manuscript ? `
                        <div class="manuscript-placeholder">
                            ${poem.manuscript.toLowerCase().endsWith('.pdf') ? `
                                    <div class="manuscript-pdf-card" style="width: 100%; border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-top: 1rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem;">
                                        <h4 style="margin: 0; color: var(--text-color); font-size: 1.1rem; text-align: center;">📄 Aperçu du Manuscrit</h4>
                                        <div class="manuscript-preview" style="width: 100%; height: 350px; overflow: hidden; border-radius: 8px; border: 1px solid var(--border-color);">
                                            <iframe src="${poem.manuscript}#toolbar=0&navpanes=0&scrollbar=0&page=1" style="width: 100%; height: 100%; border: none;" frameborder="0"></iframe>
                                        </div>
                                        <div style="display: flex; flex-direction: column; width: 100%; gap: 0.5rem;">
                                            <a href="${poem.manuscript}" target="_blank" download class="ctrl-btn" style="text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center; width: 100%;">
                                                📥 Télécharger le PDF
                                            </a>
                                            <a href="${poem.manuscript}" target="_blank" class="ctrl-btn" style="text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center; width: 100%;">
                                                👁️ Visualiser en plein écran
                                            </a>
                                        </div>
                                    </div>
                                ` : `
                                    <div style="text-align: center; display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
                                        <img class="manuscript-preview" src="${poem.manuscript}" alt="Manuscrit Original de ${poem.title}" style="width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: block;">
                                        <a href="${poem.manuscript}" target="_blank" download class="ctrl-btn" style="text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center;">
                                            📥 Télécharger l'image du manuscrit
                                        </a>
                                    </div>
                                `}
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="archive-text-pane" style="scroll-behavior: smooth;">
                        <div class="poem-content" id="poemContent" style="font-size: ${app.state.fontSize}rem">
                            ${parsedContent}
                        </div>
                        
                        <div style="margin-top: 3rem; display: flex; justify-content: center; gap: 1rem; margin-bottom: 2rem;">
                            <button class="ctrl-btn" onclick="app.navigate('author', ${author.id})" style="font-weight: 600; padding: 0.8rem 1.5rem;">
                                &larr; Retour à ${author.name}
                            </button>
                            <button class="ctrl-btn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" style="font-weight: 600; padding: 0.8rem 1.5rem;">
                                &uarr; Remonter en haut
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const query = app.state.searchQuery;
        if (query && app.state.totalHighlights > 0) {
            setTimeout(() => {
                app.setActiveHighlight(0);
            }, 300);
        } else {
            app.updateMatchCounter();
        }
    },

    toggleZen: () => {
        app.state.isZen = !app.state.isZen;
        document.body.classList.toggle('zen-active', app.state.isZen);
    },

    changeFontSize: (delta) => {
        app.state.fontSize = Math.max(1.0, Math.min(3.0, app.state.fontSize + delta));
        const poemEl = document.getElementById('poemContent');
        if (poemEl) poemEl.style.fontSize = `${app.state.fontSize}rem`;
        const indicator = document.getElementById('fontSizeIndicator');
        if (indicator) {
            indicator.textContent = `${Math.round(app.state.fontSize * 100)}%`;
        }
    },

    switchAudioTab: (event, partId) => {
        const container = event.target.closest('.media-section');
        if (!container) return;
        
        container.querySelectorAll('.audio-tab-content').forEach(el => {
            el.style.display = 'none';
            const iframe = el.querySelector('iframe');
            if (iframe) {
                const src = iframe.src;
                iframe.src = '';
                iframe.src = src;
            }
            const audio = el.querySelector('audio');
            if (audio) {
                audio.pause();
            }
        });
        
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-color)';
        });
        
        const activeContent = container.querySelector(`#${partId}`);
        if (activeContent) activeContent.style.display = 'block';
        
        event.target.style.borderColor = 'var(--accent-color)';
        event.target.style.color = 'var(--accent-color)';
    },

    renderSingleAudio: (audioObj) => {
        if (!audioObj || !audioObj.url) return '';
        
        let playerHtml = '';
        if (audioObj.type === 'youtube') {
            if (audioObj.url.includes('list=')) {
                let playlistId = '';
                try {
                    playlistId = new URL(audioObj.url).searchParams.get('list');
                } catch (e) {
                    playlistId = audioObj.url.split('list=')[1].split('&')[0];
                }
                
                playerHtml = `
                    <div class="video-container">
                        <iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=${playlistId}" 
                            title="YouTube playlist player" frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen>
                        </iframe>
                    </div>
                    <div style="text-align: center; margin-top: 10px;">
                        <a href="https://www.youtube.com/playlist?list=${playlistId}" target="_blank" style="color: var(--accent-color); text-decoration: none; font-size: 0.9rem;">
                            (Si la playlist ne démarre pas, cliquez ici pour la regarder sur YouTube)
                        </a>
                    </div>`;
            } else {
                let videoId = '';
                try {
                    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                    const match = audioObj.url.match(regExp);
                    if (match && match[2].length === 11) {
                        videoId = match[2];
                    } else {
                        if (audioObj.url.includes('v=')) {
                            videoId = new URL(audioObj.url).searchParams.get('v');
                        } else if (audioObj.url.includes('youtu.be/')) {
                            videoId = audioObj.url.split('youtu.be/')[1].split('?')[0].split('&')[0];
                        }
                    }
                } catch (e) {
                    console.error("Error parsing video URL:", e);
                }

                playerHtml = `
                    <div class="video-container">
                        <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0" 
                            title="YouTube video player" frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen>
                        </iframe>
                    </div>
                    <div style="text-align: center; margin-top: 10px;">
                        <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" style="color: var(--accent-color); text-decoration: none; font-size: 0.9rem;">
                            (Si la vidéo ne démarre pas, cliquez ici pour la regarder sur YouTube)
                        </a>
                    </div>`;
            }
        } else if (audioObj.type === 'mp3') {
            playerHtml = `
                <div class="audio-container">
                    <audio controls>
                        <source src="${audioObj.url}" type="audio/mpeg">
                        Votre navigateur ne supporte pas l'élément audio.
                    </audio>
                </div>`;
        }
        return playerHtml;
    },

    renderAudio: (audio) => {
        if (!audio) return '';

        let audioObj = audio;
        if (typeof audio === 'string') {
            const trimmed = audio.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    audioObj = JSON.parse(trimmed);
                } catch(e) {
                    audioObj = trimmed;
                }
            }
        }
        
        if (typeof audioObj === 'string') {
            const trimmed = audioObj.trim();
            if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
                audioObj = { type: 'youtube', url: trimmed };
            } else {
                audioObj = { type: 'mp3', url: trimmed };
            }
        }

        if (Array.isArray(audioObj)) {
            if (audioObj.length === 0) return '';
            
            let tabsHtml = `<div class="audio-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">`;
            let playersHtml = `<div class="audio-players">`;
            
            audioObj.forEach((item, index) => {
                const label = item.label || `Partie ${index + 1}`;
                const isActive = index === 0;
                
                tabsHtml += `
                    <button class="ctrl-btn tab-btn" 
                        onclick="window.app.switchAudioTab(event, 'audio-part-${index}')"
                        style="flex: 1; text-align: center; ${isActive ? 'border-color: var(--accent-color); color: var(--accent-color);' : ''}">
                        ${label}
                    </button>
                `;
                
                playersHtml += `
                    <div id="audio-part-${index}" class="audio-tab-content" style="display: ${isActive ? 'block' : 'none'};">
                        ${window.app.renderSingleAudio(item)}
                    </div>
                `;
            });
            
            tabsHtml += `</div>`;
            playersHtml += `</div>`;
            
            return `<div class="media-section">${tabsHtml}${playersHtml}</div>`;
        }

        return `<div class="media-section">${window.app.renderSingleAudio(audioObj)}</div>`;
    },

    getInitials: (name) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2);
    },

    getSearchSnippet: (content, query) => {
        if (!content || !query) return '';
        
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerContent.indexOf(lowerQuery);
        if (index === -1) return '';

        // Extract surrounding context (50 characters before/after)
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);
        let snippet = content.substring(start, end);

        // Replace newlines with / for a clean single-line display
        snippet = snippet.replace(/\n+/g, ' / ');

        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        // Highlight matching text case-insensitively
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return snippet.replace(regex, '<mark style="background-color: rgba(212, 175, 55, 0.3); color: inherit; padding: 0.1rem 0.2rem; border-radius: 4px; font-weight: bold;">$1</mark>');
    },

    parsePoemContent: (content, query, stanzaSize = 2) => {
        let parsedContent = '';
        let tocItems = '';
        let chapterCount = 0;
        let highlightCount = 0;
        const lines = content.split('\n');
        let currentStanzaLines = [];

        function flushStanza() {
            if (currentStanzaLines.length > 0) {
                parsedContent += `<div class="poem-stanza">${currentStanzaLines.join('<br>')}</div>`;
                currentStanzaLines = [];
            }
        }

        for (let line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('## ')) {
                flushStanza();
                chapterCount++;
                const title = trimmed.substring(3).trim();
                const id = `chap-${chapterCount}`;
                tocItems += `<li style="margin-bottom:8px;"><a href="#${id}" style="color:var(--accent-color); text-decoration:none;">${title}</a></li>`;
                parsedContent += `<h2 id="${id}" style="margin-top: 2rem; margin-bottom: 1rem; color: var(--accent-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">${title}</h2>`;
            } else if (trimmed === '') {
                flushStanza();
            } else {
                let highlightedLine = line;
                if (query) {
                    const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`(${escapedQuery})`, 'gi');
                    highlightedLine = line.replace(regex, (match) => {
                        const idx = highlightCount++;
                        return `<mark class="dynamic-highlight" data-index="${idx}" style="background-color: rgba(212, 175, 55, 0.35); padding: 0.1rem 0.2rem; border-radius: 4px; font-weight: bold;">${match}</mark>`;
                    });
                }
                currentStanzaLines.push(highlightedLine);
                if (currentStanzaLines.length === stanzaSize) {
                    flushStanza();
                }
            }
        }
        flushStanza();
        
        let tocHtml = '';
        if (chapterCount > 0) {
            const isOpen = window.innerWidth > 768 ? 'open' : '';
            tocHtml = `
            <details class="poem-toc" ${isOpen}>
                <summary>
                    <h3 style="margin: 0; font-family: 'Cinzel', serif; font-size: 1.2rem; color: var(--primary-color);">Sommaire</h3>
                    <span class="toc-arrow" style="font-size: 0.9rem; transition: transform 0.3s; color: var(--text-color); opacity: 0.8;">▼</span>
                </summary>
                <ul style="list-style:none; padding-left:0; margin-top:15px;">
                    ${tocItems}
                </ul>
            </details>
            `;
        }

        if (query) {
            app.state.totalHighlights = highlightCount;
        } else {
            app.state.totalHighlights = 0;
        }

        return { parsedContent, tocHtml };
    }
};

window.app = app;
document.addEventListener('DOMContentLoaded', app.init);
