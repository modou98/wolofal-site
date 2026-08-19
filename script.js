// App Logic
const app = {
    state: {
        isDark: false,
        searchQuery: '',
        fontSize: window.innerWidth <= 768 ? 1.05 : 1.4,
        isZen: false,
        currentView: 'home',
        currentAuthorSlug: null,
        currentPoemId: null,
        currentThemeId: null,
        authorThemeFilter: null,
        manuscriptTypeFilter: 'all',
        activeHighlightIndex: -1,
        totalHighlights: 0,
        contentLoaded: false,
        lastRenderedPath: null
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

        // Route via l'URL (History API) pour permettre les liens directs et le bouton retour.
        // Ne re-rend que si le chemin a reellement change (un clic sur une ancre #chap-N
        // du sommaire d'un poeme cree aussi une entree d'historique, mais ne change pas le pathname).
        window.addEventListener('popstate', () => {
            if (window.location.pathname === app.state.lastRenderedPath) return;
            const { view, param } = app.parsePath();
            app.render(view, param);
        });

        // Si un vieux lien en hash (#/auteur/1, #/poeme/id, ...) est ouvert/colle
        // APRES le chargement initial (l'app tourne deja), redirige aussi dans ce cas :
        // redirectLegacyHash() seul (appele plus bas) ne couvre que le chargement initial.
        window.addEventListener('hashchange', () => {
            if (!window.location.hash.startsWith('#/')) return;
            app.redirectLegacyHash();
            const { view, param } = app.parsePath();
            app.render(view, param);
        });

        app.redirectLegacyHash();
        const { view, param } = app.parsePath();
        app.render(view, param);

        app.loadContents();

        // Enregistre le service worker (PWA) : rend le site installable et
        // relancable instantanement. N'echoue pas silencieusement le reste de
        // l'app si le navigateur ne le supporte pas ou si ca rate.
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js').catch((err) => {
                    console.error('Echec de l\'enregistrement du service worker :', err);
                });
            });
        }
    },

    // Charge le texte des poèmes en arrière-plan et le fusionne dans authorsData.
    // Le premier rendu (galerie, bios, titres) n'attend pas ce chargement.
    loadContents: async () => {
        try {
            const res = await fetch('/data/poemes_content.json?v=12');
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

    // Retrouve {author, poem} a partir de l'id interne d'un poeme (id de fichier,
    // utilise partout ailleurs dans l'appli) - sert a construire l'URL publique
    // /auteur-slug/poeme-slug sans faire porter cette recherche a chaque appelant.
    findAuthorAndPoemById: (poemId) => {
        for (const a of authorsData) {
            const poem = a.poems.find(p => p.id === poemId);
            if (poem) return { author: a, poem };
        }
        return { author: null, poem: null };
    },

    routeToPath: (view, param) => {
        if (view === 'author') return `/${encodeURIComponent(param)}`;
        if (view === 'reader') {
            const { author, poem } = app.findAuthorAndPoemById(param);
            if (!author || !poem) return '/';
            return `/${encodeURIComponent(author.slug)}/${encodeURIComponent(poem.slug || poem.id)}`;
        }
        if (view === 'themes') return '/themes';
        if (view === 'theme') return `/themes/${encodeURIComponent(param)}`;
        if (view === 'manuscripts') return '/manuscrits';
        if (view === 'about') return '/apropos';
        return '/';
    },

    // Le param retourne pour la vue 'reader' reste l'id interne du poeme (pas le
    // slug d'URL) : renderReader/currentPoemId/le chargement du contenu continuent
    // d'utiliser cet id partout ailleurs, inchange par cette migration d'URL.
    parsePath: () => {
        const parts = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        if (parts.length === 0) return { view: 'home', param: null };
        const [first, second] = parts;
        if (first === 'themes') {
            return second ? { view: 'theme', param: second } : { view: 'themes', param: null };
        }
        if (first === 'manuscrits') return { view: 'manuscripts', param: null };
        if (first === 'apropos') return { view: 'about', param: null };
        const author = authorsData.find(a => a.slug === first);
        if (!author) return { view: 'notfound', param: null };
        if (second) {
            const poem = author.poems.find(p => p.slug === second || p.id === second);
            if (!poem) return { view: 'notfound', param: null };
            return { view: 'reader', param: poem.id };
        }
        return { view: 'author', param: first };
    },

    // Compatibilite avec les anciens liens en hash (#/auteur/1, #/poeme/id, ...)
    // partages/mis en favoris avant la migration vers des URLs propres.
    redirectLegacyHash: () => {
        const hash = window.location.hash;
        if (!hash.startsWith('#/')) return;
        const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
        let newPath = null;
        if (parts[0] === 'auteur' && parts[1]) {
            const author = authorsData.find(a => a.id === parseInt(parts[1], 10));
            if (author) newPath = `/${encodeURIComponent(author.slug)}`;
        } else if (parts[0] === 'poeme' && parts[1]) {
            const { author, poem } = app.findAuthorAndPoemById(parts[1]);
            if (author && poem) newPath = `/${encodeURIComponent(author.slug)}/${encodeURIComponent(poem.slug || poem.id)}`;
        } else if (parts[0] === 'themes') {
            newPath = '/themes';
        } else if (parts[0] === 'theme' && parts[1]) {
            newPath = `/themes/${encodeURIComponent(parts[1])}`;
        } else if (parts[0] === 'manuscrits') {
            newPath = '/manuscrits';
        } else if (parts[0] === 'apropos') {
            newPath = '/apropos';
        }
        window.history.replaceState(null, '', newPath || (window.location.pathname + window.location.search));
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
            app.renderAuthor(document.getElementById('app'), app.state.currentAuthorSlug);
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
            app.renderAuthor(document.getElementById('app'), app.state.currentAuthorSlug);
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
        const newPath = app.routeToPath(view, param);
        if (window.location.pathname === newPath) {
            app.render(view, param);
        } else {
            window.history.pushState({ view, param }, '', newPath);
            app.render(view, param);
        }
    },

    // Met a jour <link rel="canonical"> et <meta property="og:url"> (+ description
    // si fournie) pour que chaque page ait ses propres balises. Googlebot execute le
    // JS et relit le DOM final, ce qui aide l'indexation individuelle de chaque page
    // meme sans rendu cote serveur.
    updateMeta: (description) => {
        const canonicalUrl = `https://wolofalyi.com${window.location.pathname}`;

        let canonicalEl = document.querySelector('link[rel="canonical"]');
        if (!canonicalEl) {
            canonicalEl = document.createElement('link');
            canonicalEl.setAttribute('rel', 'canonical');
            document.head.appendChild(canonicalEl);
        }
        canonicalEl.setAttribute('href', canonicalUrl);

        let ogUrlEl = document.querySelector('meta[property="og:url"]');
        if (!ogUrlEl) {
            ogUrlEl = document.createElement('meta');
            ogUrlEl.setAttribute('property', 'og:url');
            document.head.appendChild(ogUrlEl);
        }
        ogUrlEl.setAttribute('content', canonicalUrl);

        // document.title est deja pose par chaque branche de render() juste avant
        // l'appel a updateMeta() : on le propage a og:title/twitter:title pour que
        // les deux restent coherents (ex: partage sur les reseaux, meme si les
        // scrapers qui n'executent pas le JS ne verront que le titre generique).
        const ogTitleEl = document.querySelector('meta[property="og:title"]');
        if (ogTitleEl) ogTitleEl.setAttribute('content', document.title);
        const twitterTitleEl = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitleEl) twitterTitleEl.setAttribute('content', document.title);

        if (description) {
            const descEl = document.querySelector('meta[name="description"]');
            if (descEl) descEl.setAttribute('content', description);
            const ogDescEl = document.querySelector('meta[property="og:description"]');
            if (ogDescEl) ogDescEl.setAttribute('content', description);
            const twitterDescEl = document.querySelector('meta[name="twitter:description"]');
            if (twitterDescEl) twitterDescEl.setAttribute('content', description);
        }
    },

    // Injecte/retire un bloc JSON-LD (schema.org) decrivant la page courante,
    // pour aider Google a comprendre le contenu (auteur, oeuvre litteraire,
    // langue) au-dela du simple texte visible. Passer null retire le bloc.
    setStructuredData: (data) => {
        let el = document.getElementById('structured-data');
        if (!data) {
            if (el) el.remove();
            return;
        }
        if (!el) {
            el = document.createElement('script');
            el.type = 'application/ld+json';
            el.id = 'structured-data';
            document.head.appendChild(el);
        }
        el.textContent = JSON.stringify(data);
    },

    render: (view, param = null) => {
        app.state.currentView = view;
        app.state.lastRenderedPath = window.location.pathname;
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
            document.title = "Wolofal yi - Accueil";
            app.updateMeta();
            app.setStructuredData({
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'Wolofal yi',
                url: 'https://wolofalyi.com/',
                description: 'Préservation et diffusion du patrimoine littéraire Wolofal : poèmes, manuscrits et audios des grands auteurs mourides.',
                inLanguage: 'wo'
            });
            app.renderHome(container);
        } else if (view === 'author') {
            app.state.currentAuthorSlug = param;
            app.state.authorThemeFilter = null;
            app.renderAuthor(container, param);
        } else if (view === 'reader') {
            app.state.currentPoemId = param;
            app.renderReader(container, param);
        } else if (view === 'themes') {
            document.title = "Thèmes | Wolofal yi";
            app.updateMeta();
            app.setStructuredData(null);
            app.renderThemes(container);
        } else if (view === 'theme') {
            app.state.currentThemeId = param;
            app.renderTheme(container, param);
        } else if (view === 'manuscripts') {
            document.title = "Manuscrits | Wolofal yi";
            app.updateMeta();
            app.setStructuredData(null);
            app.state.manuscriptTypeFilter = app.state.manuscriptTypeFilter || 'all';
            app.renderManuscripts(container);
        } else if (view === 'about') {
            document.title = "À propos | Wolofal yi";
            app.updateMeta();
            app.setStructuredData(null);
            app.renderAbout(container);
        } else if (view === 'notfound') {
            document.title = "Page introuvable | Wolofal yi";
            app.updateMeta();
            app.setStructuredData(null);
            app.renderNotFound(container);
        }
    },

    // Regex de recherche insensible aux accents : "geram" trouve "Gëram",
    // "serin" trouve "Sëriñ", etc. Indispensable pour les titres wolof.
    searchRegex: (query, flags = 'i') => {
        const classes = ['aàâäã', 'eéèëê', 'iîïì', 'oóôöò', 'uùûü', 'nñŋ', 'cç', "'’‘"];
        let pattern = '';
        for (const ch of query) {
            const lower = ch.toLowerCase();
            const cls = classes.find(c => c.includes(lower));
            if (cls) {
                pattern += '[' + cls + ']';
            } else {
                pattern += ch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            }
        }
        return new RegExp(pattern, flags);
    },

    renderHome: (container) => {
        const query = app.state.searchQuery;

        if (query) {
            const regex = app.searchRegex(query);
            let matchingPoems = [];
            authorsData.forEach(author => {
                const authorMatches = regex.test(author.name);
                author.poems.forEach(poem => {
                    // tier = pertinence : titre d'abord, puis auteur, extrait, contenu
                    let tier = null;
                    if (regex.test(poem.title)) tier = 0;
                    else if (authorMatches) tier = 1;
                    else if (poem.excerpt && regex.test(poem.excerpt)) tier = 2;
                    else if (poem.content && regex.test(poem.content)) tier = 3;

                    if (tier !== null) {
                        matchingPoems.push({
                            ...poem,
                            authorName: author.name,
                            authorId: author.id,
                            tier
                        });
                    }
                });
            });

            matchingPoems.sort((a, b) => a.tier - b.tier || a.title.localeCompare(b.title));

            const poemsHtml = matchingPoems.map(poem => {
                const snippet = app.getSearchSnippet(poem.content, query);
                return `
                <a class="search-poem-card" href="${app.routeToPath('reader', poem.id)}" onclick="app.navigate('reader', '${poem.id}'); return false;">
                    <div style="display: flex; flex-direction: column; gap: 0.25rem; text-align: left; width: 100%;">
                        <span class="poem-title" style="font-size: 1.3rem;">${poem.title}</span>
                        <span class="poem-author" style="font-size: 0.9rem; color: var(--accent-color); font-weight: 500;">par ${poem.authorName}</span>
                        ${poem.excerpt ? `<span class="poem-excerpt">${poem.excerpt}</span>` : ''}
                        ${snippet ? `<div class="poem-snippet">${snippet}</div>` : ''}
                    </div>
                    <span class="poem-meta" style="white-space: nowrap; margin-left: 1rem;">Lire &rarr;</span>
                </a>
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
                <a class="author-card" href="${app.routeToPath('author', author.slug)}" onclick="app.navigate('author', '${author.slug}'); return false;">
                    <div class="card-image" ${author.image ? `role="img" aria-label="Portrait de ${author.name}"` : 'aria-hidden="true"'} style="${author.image ? `background-image: url('${app.assetUrl(author.image)}'); background-size: cover; background-position: top;` : ''}">
                        ${!author.image ? `<span>${app.getInitials(author.name)}</span>` : ''}
                    </div>
                    <div class="card-content">
                        <h3>${author.name}</h3>
                        <p>${author.shortBio}</p>
                    </div>
                </a>
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

    // Nombre de poèmes par nom de thème, tous auteurs confondus
    countPoemsByTheme: () => {
        const counts = {};
        authorsData.forEach(author => {
            author.poems.forEach(poem => {
                (poem.themes || []).forEach(name => {
                    counts[name] = (counts[name] || 0) + 1;
                });
            });
        });
        return counts;
    },

    renderThemes: (container) => {
        const counts = app.countPoemsByTheme();
        const themesHtml = (window.themesData || []).map(theme => {
            const n = counts[theme.name] || 0;
            return `
            <a class="theme-card ${n === 0 ? 'theme-card-empty' : ''}" href="${app.routeToPath('theme', theme.id)}" onclick="app.navigate('theme', '${theme.id}'); return false;">
                <h3>${theme.name}</h3>
                <span class="theme-count">${n} poème${n > 1 ? 's' : ''}</span>
            </a>
            `;
        }).join('');

        container.innerHTML = `
            <div class="gallery-header">
                <h1>Les Thèmes</h1>
                <p>Parcourez les poèmes par thème, tous auteurs confondus.</p>
            </div>
            <div class="themes-grid">
                ${themesHtml || '<p style="text-align:center;">Aucun thème défini.</p>'}
            </div>
        `;
    },

    renderTheme: (container, themeId) => {
        const theme = (window.themesData || []).find(t => t.id === themeId);
        if (!theme) {
            app.navigate('themes');
            return;
        }

        document.title = `${theme.name} | Wolofal yi`;
        app.updateMeta(`Poèmes wolofal classés sous le thème ${theme.name}.`);
        app.setStructuredData({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: theme.name,
            url: `https://wolofalyi.com${app.routeToPath('theme', theme.id)}`,
            isPartOf: {
                '@type': 'WebSite',
                name: 'Wolofal yi',
                url: 'https://wolofalyi.com/'
            }
        });

        let poems = [];
        authorsData.forEach(author => {
            author.poems.forEach(poem => {
                if ((poem.themes || []).includes(theme.name)) {
                    poems.push({ ...poem, authorName: author.name, authorId: author.id });
                }
            });
        });
        poems.sort((a, b) => a.authorName.localeCompare(b.authorName) || a.title.localeCompare(b.title));

        const poemsHtml = poems.map(poem => `
            <a class="search-poem-card" href="${app.routeToPath('reader', poem.id)}" onclick="app.navigate('reader', '${poem.id}'); return false;">
                <div style="display: flex; flex-direction: column; gap: 0.25rem; text-align: left; width: 100%;">
                    <span class="poem-title" style="font-size: 1.3rem;">${poem.title}</span>
                    <span class="poem-author" style="font-size: 0.9rem; color: var(--accent-color); font-weight: 500;">par ${poem.authorName}</span>
                    ${poem.excerpt ? `<span class="poem-excerpt">${poem.excerpt}</span>` : ''}
                </div>
                <span class="poem-meta" style="white-space: nowrap; margin-left: 1rem;">Lire &rarr;</span>
            </a>
        `).join('');

        container.innerHTML = `
            <div class="author-view">
                <button class="back-button" onclick="app.navigate('themes')">
                    &larr; Tous les thèmes
                </button>
                <div class="gallery-header">
                    <h1>${theme.name}</h1>
                    <p>${poems.length} poème${poems.length > 1 ? 's' : ''}</p>
                </div>
                <div class="search-results" style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; width: 100%;">
                    ${poemsHtml || `
                    <div class="empty-state">
                        <h3>Aucun poème pour ce thème</h3>
                        <p>Les poèmes de ce thème seront bientôt disponibles.</p>
                    </div>
                    `}
                </div>
            </div>
        `;
    },

    // Convertit un lien de partage Google Drive (".../file/d/ID/view...") en URL
    // embarquable pour un <iframe> ("/preview"). Laisse les autres URLs telles quelles.
    // Un chemin local (ex: "assets/photo.png") doit rester resolu depuis la
    // racine du site meme quand l'URL affichee n'est plus '/' (routage par
    // chemin propre) : on force un '/' devant s'il n'y en a pas deja un, et on
    // laisse intactes les URLs externes (http...) ou data:.
    assetUrl: (path) => {
        if (!path) return path;
        if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith('/') || path.startsWith('data:')) return path;
        return '/' + path;
    },

    driveEmbedUrl: (url) => {
        const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        return m ? `https://drive.google.com/file/d/${m[1]}/preview` : app.assetUrl(url);
    },

    // URL de téléchargement direct pour un lien Drive ; sinon l'URL d'origine.
    driveDownloadUrl: (url) => {
        const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : app.assetUrl(url);
    },

    isPdfUrl: (url) => {
        return url.toLowerCase().endsWith('.pdf') || url.includes('drive.google.com');
    },

    renderManuscripts: (container) => {
        const filter = app.state.manuscriptTypeFilter || 'all';
        const manuscripts = (window.manuscriptsData || []).filter(m => filter === 'all' || m.type === filter);

        const byAuthor = {};
        manuscripts.forEach(m => {
            (byAuthor[m.authorId] = byAuthor[m.authorId] || []).push(m);
        });

        const authorsHtml = authorsData
            .filter(a => byAuthor[a.id] && byAuthor[a.id].length > 0)
            .map(author => {
                const cards = byAuthor[author.id].map(m => `
                    <div class="manuscript-card">
                        <span class="manuscript-type-badge manuscript-type-${m.type}">${m.type === 'ajami' ? 'Ajami' : 'Transcrit'}</span>
                        <h3>${m.title}</h3>
                        <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                            <a href="${app.driveEmbedUrl(m.url)}" target="_blank" class="ctrl-btn" style="text-decoration:none; flex:1; text-align:center;">👁️ Consulter</a>
                            <a href="${app.driveDownloadUrl(m.url)}" target="_blank" download class="ctrl-btn" style="text-decoration:none; flex:1; text-align:center;">📥 Télécharger</a>
                        </div>
                    </div>
                `).join('');
                return `
                    <div class="manuscript-author-section">
                        <h2>${author.name}</h2>
                        <div class="manuscripts-grid">${cards}</div>
                    </div>
                `;
            }).join('');

        container.innerHTML = `
            <div class="gallery-header">
                <h1>Les Manuscrits</h1>
                <p>Manuscrits originaux en Ajami et recueils transcrits, classés par auteur.</p>
            </div>
            <div class="theme-pills" style="justify-content:center; margin-bottom:2rem;">
                <button class="theme-pill ${filter === 'all' ? 'active' : ''}" onclick="app.setManuscriptFilter('all')">Tous</button>
                <button class="theme-pill ${filter === 'ajami' ? 'active' : ''}" onclick="app.setManuscriptFilter('ajami')">Ajami</button>
                <button class="theme-pill ${filter === 'transcrit' ? 'active' : ''}" onclick="app.setManuscriptFilter('transcrit')">Transcrit</button>
            </div>
            ${authorsHtml || `
            <div class="empty-state">
                <h3>Aucun manuscrit</h3>
                <p>Aucun manuscrit disponible pour l'instant dans cette catégorie.</p>
            </div>
            `}
        `;
    },

    renderAbout: (container) => {
        container.innerHTML = `
            <div class="gallery-header">
                <h1>À propos</h1>
                <p>Wolofal yi — Préservation et diffusion du patrimoine littéraire Wolofal.</p>
            </div>
            <div class="about-content">
                <section class="about-section">
                    <h2>Présentation</h2>
                    <p>Wolofal yi est une archive numérique dédiée à la poésie religieuse en Wolofal (l'écriture ajami du wolof), transmise par les grandes figures du mouridisme : Sëriñ Muusaa Ka, Sëriñ Mbay Jaxate, Sëriñ Moor Kayre, Soxna Maymuuna Mbàkke Al Kubra, Seex Sàmba Jaara Mbay, et d'autres voix du patrimoine littéraire wolof.</p>
                    <p>Le site rassemble les textes de ces poèmes, leurs manuscrits originaux, ainsi que des enregistrements audio, pour permettre à chacun de lire, écouter et explorer cette littérature par auteur ou par thème.</p>
                </section>
                <section class="about-section">
                    <h2>Notre mission</h2>
                    <p>Ces textes, souvent transmis de génération en génération sous forme manuscrite, risquent de se perdre avec le temps. Notre mission est de les préserver, de les rendre accessibles gratuitement en ligne, et de faciliter leur transmission aux générations futures — dans le respect de leur langue, de leur graphie originale et de leur sens spirituel.</p>
                </section>
                <section class="about-section">
                    <h2>Contact</h2>
                    <p>Pour toute question, correction, ou pour contribuer avec un manuscrit ou un enregistrement, écrivez-nous :</p>
                    <a href="mailto:serignmbayjaxate@gmail.com" class="ctrl-btn about-contact-btn">✉️ serignmbayjaxate@gmail.com</a>
                </section>
            </div>
        `;
    },

    renderNotFound: (container) => {
        container.innerHTML = `
            <div class="gallery-header">
                <h1>Page introuvable</h1>
                <p>Ce lien ne correspond à aucune page du site.</p>
            </div>
            <div style="text-align:center; margin-top: 2rem;">
                <a href="/" class="ctrl-btn" onclick="app.navigate('home'); return false;" style="text-decoration:none; font-weight:600; padding: 0.8rem 1.5rem;">&larr; Retour à l'accueil</a>
            </div>
        `;
    },

    setManuscriptFilter: (type) => {
        app.state.manuscriptTypeFilter = type;
        app.renderManuscripts(document.getElementById('app'));
    },

    setAuthorThemeFilter: (themeId) => {
        app.state.authorThemeFilter = themeId;
        app.renderAuthor(document.getElementById('app'), app.state.currentAuthorSlug);
    },

    renderAuthor: (container, authorSlug) => {
        const author = authorsData.find(a => a.slug === authorSlug);
        if (!author) return;

        document.title = `${author.name} | Wolofal yi`;
        app.updateMeta(author.shortBio);
        app.setStructuredData({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: author.name,
            description: author.shortBio,
            image: author.image ? `https://wolofalyi.com${app.assetUrl(author.image)}` : undefined,
            url: `https://wolofalyi.com${app.routeToPath('author', author.slug)}`
        });

        const query = app.state.searchQuery;
        const regex = query ? app.searchRegex(query) : null;
        let poems = query ? author.poems.filter(p => {
            return regex.test(p.title) ||
                (p.excerpt && regex.test(p.excerpt)) ||
                (p.content && regex.test(p.content));
        }) : [...author.poems];

        // Pastilles de filtre par thème : uniquement les thèmes présents chez cet auteur
        const themeCounts = {};
        author.poems.forEach(p => (p.themes || []).forEach(name => {
            themeCounts[name] = (themeCounts[name] || 0) + 1;
        }));
        const authorThemes = (window.themesData || []).filter(t => themeCounts[t.name]);
        const activeFilter = app.state.authorThemeFilter;
        let themePillsHtml = '';
        if (authorThemes.length > 0) {
            const pills = authorThemes.map(t => `
                <button class="theme-pill ${activeFilter === t.id ? 'active' : ''}" onclick="app.setAuthorThemeFilter('${t.id}')">
                    ${t.name} <span class="theme-pill-count">${themeCounts[t.name]}</span>
                </button>
            `).join('');
            themePillsHtml = `
                <div class="theme-pills" role="group" aria-label="Filtrer par thème">
                    <button class="theme-pill ${!activeFilter ? 'active' : ''}" onclick="app.setAuthorThemeFilter(null)">
                        Tous <span class="theme-pill-count">${author.poems.length}</span>
                    </button>
                    ${pills}
                </div>
            `;
        }

        if (activeFilter) {
            const theme = (window.themesData || []).find(t => t.id === activeFilter);
            if (theme) {
                poems = poems.filter(p => (p.themes || []).includes(theme.name));
            }
        }
        poems.sort((a, b) => a.title.localeCompare(b.title));

        const poemsHtml = poems.map(poem => {
            const snippet = query ? app.getSearchSnippet(poem.content, query) : '';
            return `
            <a class="poem-item" href="${app.routeToPath('reader', poem.id)}" onclick="app.navigate('reader', '${poem.id}'); return false;" style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <span class="poem-title" style="font-size: 1.3rem;">${poem.title}</span>
                    <span class="poem-meta" style="white-space: nowrap; margin-left: 1rem;">Lire &rarr;</span>
                </div>
                ${poem.excerpt ? `<span class="poem-excerpt">${poem.excerpt}</span>` : ''}
                ${snippet ? `<div class="poem-snippet" style="width: 100%;">${snippet}</div>` : ''}
            </a>
            `;
        }).join('');

        container.innerHTML = `
            <div class="author-view">
                <button class="back-button" onclick="app.navigate('home')">
                    &larr; Retour à la galerie
                </button>
                <div class="author-header">
                    <div class="author-portrait" ${author.image ? `role="img" aria-label="Portrait de ${author.name}"` : 'aria-hidden="true"'} style="${author.image ? `background-image: url('${app.assetUrl(author.image)}'); background-size: cover; background-position: top;` : ''}"></div>
                    <div class="author-info">
                        <h1>${author.name}</h1>
                        <div class="author-bio">${author.fullBio.replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
                <div class="poems-list">
                    <h2>Œuvres Disponibles</h2>
                    ${themePillsHtml}
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

        const poemStructuredData = {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: poem.title,
            genre: 'Poem',
            inLanguage: 'wo',
            description: poem.excerpt,
            url: `https://wolofalyi.com${app.routeToPath('reader', poem.id)}`,
            author: {
                '@type': 'Person',
                name: author.name,
                url: `https://wolofalyi.com${app.routeToPath('author', author.slug)}`
            },
            isPartOf: {
                '@type': 'WebSite',
                name: 'Wolofal yi',
                url: 'https://wolofalyi.com/'
            }
        };

        // Le texte est chargé en async : si pas encore là, on affiche une attente
        // et loadContents() re-rendra la vue une fois le JSON arrivé.
        if (poem.content === undefined) {
            document.title = `${poem.title} - par ${author.name} | Wolofal yi`;
            app.updateMeta(poem.excerpt);
            app.setStructuredData(poemStructuredData);
            container.innerHTML = `
                <div class="reader-view" style="max-width: 1200px; text-align: center; padding: 4rem 1rem;">
                    <p style="opacity: 0.7;">Chargement du texte…</p>
                </div>
            `;
            return;
        }

        const { parsedContent, tocHtml } = app.parsePoemContent(poem.content, app.state.searchQuery, poem.stanzaSize || 2);

        document.title = `${poem.title} - par ${author.name} | Wolofal yi`;
        app.updateMeta(poem.excerpt);
        app.setStructuredData(poemStructuredData);

        const manuscriptIsPdf = poem.manuscript && app.isPdfUrl(poem.manuscript);
        const manuscriptEmbedUrl = poem.manuscript ? app.driveEmbedUrl(poem.manuscript) : '';
        const manuscriptDownloadUrl = poem.manuscript ? app.driveDownloadUrl(poem.manuscript) : '';
        const manuscriptIframeSrc = poem.manuscript && poem.manuscript.includes('drive.google.com')
            ? manuscriptEmbedUrl
            : `${manuscriptEmbedUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1`;

        container.innerHTML = `
            <div class="reader-view" style="max-width: 1200px;">
                <div class="reader-top-bar">
                    <button class="back-button" style="margin-bottom:0;" onclick="app.navigate('author', '${author.slug}')">
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
                            ${manuscriptIsPdf ? `
                                    <div class="manuscript-pdf-card" style="width: 100%; border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-top: 1rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem;">
                                        <h4 style="margin: 0; color: var(--text-color); font-size: 1.1rem; text-align: center;">📄 Aperçu du Manuscrit</h4>
                                        <div class="manuscript-preview" style="width: 100%; height: 350px; overflow: hidden; border-radius: 8px; border: 1px solid var(--border-color);">
                                            <iframe src="${manuscriptIframeSrc}" style="width: 100%; height: 100%; border: none;" frameborder="0"></iframe>
                                        </div>
                                        <div style="display: flex; flex-direction: column; width: 100%; gap: 0.5rem;">
                                            <a href="${manuscriptDownloadUrl}" target="_blank" download class="ctrl-btn" style="text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center; width: 100%;">
                                                📥 Télécharger le PDF
                                            </a>
                                            <a href="${manuscriptEmbedUrl}" target="_blank" class="ctrl-btn" style="text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center; width: 100%;">
                                                👁️ Visualiser en plein écran
                                            </a>
                                        </div>
                                    </div>
                                ` : `
                                    <div style="text-align: center; display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
                                        <img class="manuscript-preview" src="${app.assetUrl(poem.manuscript)}" alt="Manuscrit Original de ${poem.title}" style="width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: block;">
                                        <a href="${app.assetUrl(poem.manuscript)}" target="_blank" download class="ctrl-btn" style="text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center;">
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
                            <button class="ctrl-btn" onclick="app.navigate('author', '${author.slug}')" style="font-weight: 600; padding: 0.8rem 1.5rem;">
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

        const match = app.searchRegex(query).exec(content);
        if (!match) return '';
        const index = match.index;

        // Extract surrounding context (50 characters before/after)
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + match[0].length + 50);
        let snippet = content.substring(start, end);

        // Replace newlines with / for a clean single-line display
        snippet = snippet.replace(/\n+/g, ' / ');

        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        // Highlight matching text (accent- and case-insensitive)
        return snippet.replace(app.searchRegex(query, 'gi'), m => `<mark style="background-color: rgba(212, 175, 55, 0.3); color: inherit; padding: 0.1rem 0.2rem; border-radius: 4px; font-weight: bold;">${m}</mark>`);
    },

    parsePoemContent: (content, query, stanzaSize = 2) => {
        let parsedContent = '';
        let tocItems = '';
        let chapterCount = 0;
        let highlightCount = 0;
        const lines = content.split('\n');
        let currentStanzaLines = [];

        // Un paragraphe (lignes non vides consécutives) n'est redécoupé par StanzaSize
        // que si ça tombe juste (multiple exact) : sinon on le garde entier, pour ne
        // pas casser une strophe irrégulière déjà délimitée par des lignes vides.
        function flushStanza() {
            if (currentStanzaLines.length === 0) return;
            if (stanzaSize > 0 && currentStanzaLines.length % stanzaSize === 0) {
                for (let i = 0; i < currentStanzaLines.length; i += stanzaSize) {
                    const chunk = currentStanzaLines.slice(i, i + stanzaSize);
                    parsedContent += `<div class="poem-stanza">${chunk.join('<br>')}</div>`;
                }
            } else {
                parsedContent += `<div class="poem-stanza">${currentStanzaLines.join('<br>')}</div>`;
            }
            currentStanzaLines = [];
        }

        for (let line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('## ')) {
                flushStanza();
                chapterCount++;
                const title = trimmed.substring(3).trim();
                const id = `chap-${chapterCount}`;
                tocItems += `<li style="margin-bottom:8px;"><a href="#${id}" style="color:var(--accent-color); text-decoration:none;">${title}</a></li>`;
                parsedContent += `<h2 id="${id}" style="margin-top: 2rem; margin-bottom: 1rem; font-size: inherit; font-weight: inherit; font-family: inherit; color: var(--accent-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">${title}</h2>`;
            } else if (trimmed === '') {
                flushStanza();
            } else {
                let highlightedLine = line;
                if (query) {
                    const regex = app.searchRegex(query, 'gi');
                    highlightedLine = line.replace(regex, (match) => {
                        const idx = highlightCount++;
                        return `<mark class="dynamic-highlight" data-index="${idx}" style="background-color: rgba(212, 175, 55, 0.35); padding: 0.1rem 0.2rem; border-radius: 4px; font-weight: bold;">${match}</mark>`;
                    });
                }
                currentStanzaLines.push(highlightedLine);
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
