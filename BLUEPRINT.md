# Oostagri Leierskap Feedback App - Blueprint

**Weergawe:** 1.3.4
**Datum:** Januarie 2026
**Taal:** Afrikaans (UI en kode kommentaar)

---

## 1. OORSIG

### Wat doen die app?
Die Oostagri Leierskap app is 'n leierskapsterugvoer- en evaluasiestelsel vir **Frikkie Oosthuizen & Seuns**, 'n boerderyonderneming. Dit fasiliteer:

1. **360-graad Eweknie-evaluasies** - Topbestuurslede evalueer mekaar op 7 leierskapsdimensies
2. **Self-evaluasies** - Bestuurders evalueer hulself op dieselfde kriteria
3. **Melkstal-evaluasies** - Topbestuur evalueer melkstalbestuurders (middelvlak) op operasionele metrike
4. **Coach-oorsig** - 'n Afrigter (coach) kan alle evaluasies sien en vergelyking doen

### Wie is die gebruikers?

| Rol | Beskrywing | Wat hulle doen |
|-----|------------|----------------|
| `topbestuur` | Senior bestuurders | Evalueer alle ander topbestuur (eweknie + self), evalueer hul eie melkstalbestuurders |
| `middelvlak` | Melkstalbestuurders | Word geëvalueer deur hul toesighouer (kan nie self aanmeld nie) |
| `coach` | Eksterne afrigter | Sien opsommings en detail van alle evaluasies, kan data eksporteer |

### Watter probleem los dit op?
- Gestruktureerde leierskapsterugvoer binne 'n familiebesigheid
- Anonieme eweknie-evaluasies vir eerlike terugvoer
- Maandelikse operasionele evaluasies van melkstalle
- Sentrale plek vir data (Google Sheets) met mobiele toegang

---

## 2. TEGNOLOGIE STAPEL

### Frontend
| Tegnologie | Doel |
|------------|------|
| **React 18** | UI biblioteek (via CDN, nie gebou nie) |
| **Babel Standalone** | In-browser JSX transformasie |
| **Tailwind CSS** | Styling (via CDN) |
| **Service Worker** | PWA ondersteuning, offline kas |

**Belangrik:** Alle frontend kode is in 'n enkele `index.html` lêer (~180KB). Geen build proses nie - React en Babel word tydens runtime gelaai.

### Backend
| Tegnologie | Doel |
|------------|------|
| **Google Apps Script** | Serverless API |
| **Google Sheets** | Databasis |

Die backend is 'n enkele `Code.gs` lêer wat as web app gepubliseer word.

### Hosting
| Komponent | Platform |
|-----------|----------|
| Frontend | GitHub Pages |
| Backend/API | Google Apps Script Web App |
| Databasis | Google Sheets |

---

## 3. LÊERSTRUKTUUR

```
oostagri-perform/
├── index.html      # Volledige frontend app (~180KB)
│                   # - HTML struktuur
│                   # - CSS styles (inline)
│                   # - React komponente (in <script type="text/babel">)
│                   # - Ikone (SVG as React komponente)
│                   # - Offline queue logika
│                   # - Service worker registrasie
│
├── Code.gs         # Backend API (~40KB)
│                   # - Alle API endpoints
│                   # - Google Sheets interaksie
│                   # - E-pos funksionaliteit (vergeet kode)
│
├── manifest.json   # PWA manifest
│                   # - App naam en ikone
│                   # - Display instellings
│
└── sw.js           # Service Worker
                    # - Cache strategie
                    # - Offline ondersteuning
```

---

## 4. DATABASIS STRUKTUUR (Google Sheets)

### Tabel: `Users`
| Kolom | Tipe | Beskrywing |
|-------|------|------------|
| Code | String | Unieke aanmeldkode (primêre sleutel) |
| Name | String | Volledige naam |
| Email | String | E-pos adres |
| Role | String | `topbestuur` / `middelvlak` / `coach` |
| Active | Boolean | Of gebruiker aktief is |
| SupervisorCode | String | Kode van toesighouer (vir middelvlak) |
| Location | String | Melkstal lokasie (vir middelvlak) |

### Tabel: `Cycles`
| Kolom | Tipe | Beskrywing |
|-------|------|------------|
| ID | String | Siklus ID in formaat `YYYY-MM` |
| Name | String | Vertoon naam (bv. "Januarie 2026") |
| StartDate | Date | Begin datum |
| EndDate | Date | Einde datum |
| Active | Boolean | Of dit die huidige aktiewe siklus is |

### Tabel: `Evaluations` (Topbestuur evaluasies)
| Kolom | Tipe | Beskrywing |
|-------|------|------------|
| ID | UUID | Unieke evaluasie ID |
| CycleID | String | Verwys na Cycles.ID |
| EvaluatorCode | String | Wie evalueer (verwys na Users.Code) |
| EvaluatorName | String | Naam van evalueerder |
| SubjectCode | String | Wie word geëvalueer |
| SubjectName | String | Naam van onderwerp |
| SubmittedAt | DateTime | Indiening tydstempel |
| UpdatedAt | DateTime | Laaste wysiging |
| Q1Grade | Number | Punt vir vraag 1 (1-5) |
| Q1Comment | String | Opmerking vir vraag 1 |
| Q2Grade - Q7Grade | Number | Punte vir vrae 2-7 |
| Q2Comment - Q7Comment | String | Opmerkings vir vrae 2-7 |

### Tabel: `MelkstalEvaluations`
| Kolom | Tipe | Beskrywing |
|-------|------|------------|
| ID | UUID | Unieke evaluasie ID |
| EvaluatorCode | String | Toesighouer wat evalueer |
| EvaluatorName | String | Naam van evalueerder |
| SubjectCode | String | Melkstalbestuurder se kode |
| SubjectName | String | Naam |
| Location | String | Melkstal lokasie |
| Month | String | Maand ID (YYYY-MM) |
| SubmittedAt | DateTime | Tydstempel |
| ms1 - ms25 | Various | Individuele antwoorde per vraag |

### Verwantskappe

```
Users (Code) ←──────────────── Evaluations (EvaluatorCode)
Users (Code) ←──────────────── Evaluations (SubjectCode)
Users (Code) ←──────────────── MelkstalEvaluations (EvaluatorCode)
Users (Code) ←──────────────── MelkstalEvaluations (SubjectCode)
Users (SupervisorCode) ←────── Users (Code) [middelvlak → topbestuur]
Cycles (ID) ←──────────────── Evaluations (CycleID)
```

---

## 5. GEBRUIKERSVLOEI

### 5.1 Topbestuur Gebruiker

```
┌─────────────┐
│   Login     │ ← Voer kode in
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│           Dashboard                      │
│  ┌─────────────────────────────────────┐│
│  │ Huidige Siklus: Januarie 2026       ││
│  │ Topbestuur: 3/5 voltooi             ││
│  │ Melkstal: 2/4 voltooi               ││
│  └─────────────────────────────────────┘│
│                                          │
│  [Evalueer Topbestuur]  [Evalueer Melkstal] │
│  [My Evaluasies]        [Teken Uit]      │
└─────────────────────────────────────────┘
       │
       ├──────────────────────────────────┐
       │                                  │
       ▼                                  ▼
┌─────────────────┐              ┌─────────────────┐
│ Kies Topbestuur │              │ Kies Melkstal-  │
│ lid om te       │              │ bestuurder      │
│ evalueer        │              └────────┬────────┘
└────────┬────────┘                       │
         │                                ▼
         ▼                       ┌─────────────────┐
┌─────────────────┐              │ Melkstal        │
│ 7 Vrae Evalua-  │              │ Evaluasie       │
│ sie Form        │              │ (25 vrae in     │
│ (5-punt skaal + │              │ 4 afdelings)    │
│ opmerkings)     │              └────────┬────────┘
└────────┬────────┘                       │
         │                                │
         └────────────┬───────────────────┘
                      ▼
              ┌─────────────┐
              │  Sukses!    │
              │  Gaan terug │
              └─────────────┘
```

### 5.2 Coach Gebruiker

```
┌─────────────┐
│   Login     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│        Coach Dashboard                   │
│  ┌─────────────────────────────────────┐│
│  │ Voltooiingsyfer: 65%                ││
│  │ 13/20 evaluasies voltooi            ││
│  └─────────────────────────────────────┘│
│                                          │
│  Persoon Opsomming:                      │
│  ┌──────────────────────────────────┐   │
│  │ Jan Botha      Gem: 3.8  ▶ Bekyk │   │
│  │ Piet van Wyk   Gem: 4.1  ▶ Bekyk │   │
│  │ ...                               │   │
│  └──────────────────────────────────┘   │
│                                          │
│  [Eksporteer Alles]                      │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│        Persoon Detail                    │
│  Self-evaluasie vs Eweknie gemiddeld    │
│  Per-vraag vergelyking                  │
│  Alle opmerkings                        │
│  [Eksporteer Persoon]                   │
└─────────────────────────────────────────┘
```

### Skerms in die App

| Skerm | Komponent | Beskrywing |
|-------|-----------|------------|
| Login | `LoginScreen` | Kode invoer, vergeet kode funksie |
| Geen Siklus | `NoCycleScreen` | Wys as geen aktiewe siklus |
| Dashboard | `DashboardScreen` | Hoofskerm met aksies |
| Evaluasie | `EvaluationScreen` | 7-vraag evaluasievorm |
| Melkstal Evaluasie | `MelkstalEvaluationScreen` | 25-vraag operasionele vorm |
| Sukses | `SuccessScreen` | Na suksesvolle indiening |
| My Evaluasies | `MyEvaluationsScreen` | Geskiedenis met wysig/bekyk |
| Bekyk Evaluasie | `ViewEvaluationScreen` | Leesalleen beskouing |
| Coach Detail | `CoachDetailScreen` | Detail per persoon vir coach |

---

## 6. API ENDPOINTS

Alle API calls gebruik `GET` versoeke na die Apps Script URL met `action` parameter.

### Autentikasie

| Aksie | Parameters | Response |
|-------|------------|----------|
| `login` | `code` | `{ success, user: { code, name, email, role } }` |
| `forgotCode` | `email` | `{ success }` - Stuur e-pos met kode |

### Data Ophaal

| Aksie | Parameters | Response |
|-------|------------|----------|
| `getInitialData` | `userId`, `role`, `monthId` | Kombineer: cycle, subjects, completedSubjects, myEvaluations, subordinates, completedSubordinates, myMelkstalEvaluations, coachData |
| `getCurrentCycle` | - | `{ success, cycle }` |
| `getSubjects` | `userId` | `{ success, subjects[] }` |
| `getEvaluationStatus` | `userId`, `cycleId` | `{ success, completedSubjects[] }` |
| `getUserEvaluations` | `userId`, `cycleId` | `{ success, evaluations[] }` |
| `getSubordinates` | `supervisorId` | `{ success, subordinates[] }` |
| `getMelkstalStatus` | `supervisorId`, `monthId` | `{ success, completedSubordinates[] }` |
| `getUserMelkstalEvaluations` | `userId` | `{ success, evaluations[] }` |

### Data Skryf

| Aksie | Parameters | Response |
|-------|------------|----------|
| `submitEvaluation` | `data` (JSON) | `{ success, id }` |
| `updateEvaluation` | `data` (JSON) | `{ success }` |
| `submitMelkstalEvaluation` | `data` (JSON) | `{ success, id }` |

### Coach Funksies

| Aksie | Parameters | Response |
|-------|------------|----------|
| `getCycleSummary` | `cycleId`, `requesterId` | `{ success, summary }` |
| `getPersonDetail` | `subjectId`, `cycleId`, `requesterId` | `{ success, evaluations[] }` |
| `exportEvaluations` | `cycleId`, `requesterId`, `personId?` | `{ success, evaluations[] }` |

### Response Formaat (Standaard)

```javascript
// Sukses
{
  success: true,
  // ... data velde
}

// Fout
{
  success: false,
  error: "Foutboodskap in Afrikaans"
}

// Offline (van Service Worker)
{
  success: false,
  offline: true,
  error: "Geen internetverbinding"
}
```

---

## 7. HUIDIGE BEPERKINGS EN PROBLEME

### Tegniese Beperkings

| Probleem | Beskrywing | Impak |
|----------|------------|-------|
| **Geen build proses** | React/Babel word in browser gelaai en getransformeer | Stadige eerste laai, groot bundle |
| **Enkele HTML lêer** | ~180KB lêer met alles | Moeilik om te onderhou |
| **Google Sheets as DB** | Nie ontwerp vir hoë volume | Kan stadig word met baie data |
| **GET vir alles** | Selfs data skryf gebruik GET met URL params | URL lengte beperkings, nie RESTful |
| **Geen egte auth** | Slegs 'n kode - geen wagwoord of sessie | Sekuriteitsrisiko |

### UX Probleme

| Probleem | Beskrywing |
|----------|------------|
| **Komplekse Melkstal vorm** | 25 vrae oor 4 afdelings kan oorweldigend wees |
| **Geen vordering stoor** | As jy die vorm verlaat, verloor jy alles |
| **Beperkte fouthantering** | Generiese foutboodskappe |
| **Geen notifikasies** | Gebruikers weet nie wanneer om te evalueer nie |
| **Moeilike navigasie** | Tabs en skerms kan verwarrend wees |

### Data Probleme

| Probleem | Beskrywing |
|----------|------------|
| **CycleID formaat** | Soms ISO datum string, soms YYYY-MM - veroorsaak mismatches |
| **Kolomnaam variasies** | Sommige kolomme het verskillende name (Month vs MonthID) |
| **Tipe verwarring** | Getalle vs strings veroorsaak vergelyking probleme |

### Bekende Bugs (Reggestel)

- ~~Evaluasie data laai nie~~ (CycleID formaat fix)
- ~~Export wys 0 resultate~~ (null parameter fix)
- ~~Melkstal tab crash~~ (vereenvoudig rendering)
- ~~Q1Grade vs q1Grade~~ (case-insensitive lookup)

---

## 8. KODE VOORBEELDE

### 8.1 API Call (Frontend)

```javascript
const apiCall = async (action, params = {}) => {
    const url = new URL(API_URL);
    url.searchParams.append('action', action);

    Object.entries(params).forEach(([key, value]) => {
        // Skip null/undefined - moenie as "null" string stuur nie
        if (value === null || value === undefined) return;
        if (typeof value === 'object') {
            url.searchParams.append(key, JSON.stringify(value));
        } else {
            url.searchParams.append(key, value);
        }
    });

    const response = await fetch(url.toString());
    return await response.json();
};
```

### 8.2 Backend Endpoint Handler (Code.gs)

```javascript
function doGet(e) {
  const params = e.parameter;
  const action = params.action;

  try {
    switch (action) {
      case 'login':
        return jsonResponse(login(params.code));
      case 'getInitialData':
        return jsonResponse(getInitialData(
          params.userId,
          params.role,
          params.monthId
        ));
      // ... meer aksies
      default:
        return jsonResponse({ success: false, error: 'Ongeldige aksie' });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 8.3 Evaluasie Vrae Definisie

```javascript
const QUESTIONS = [
    {
        id: 'q1',
        title: 'Aanspreeklikheid en Eienaarskap',
        description: 'In watter mate neem die bestuurder volle verantwoordelikheid...',
        hint: 'Let op konsekwentheid, opvolging...'
    },
    // ... 7 vrae totaal
];

const GRADE_LABELS = {
    1: 'Voldoen nie aan vereistes',
    2: 'Gedeeltelik voldoen',
    3: 'Voldoen aan vereistes',
    4: 'Oorskry vereistes',
    5: 'Uitsonderlik'
};
```

### 8.4 Melkstal Vrae Struktuur

```javascript
const MELKSTAL_SECTIONS = [
    {
        id: 'kuddebestuur',
        title: 'Kuddebestuur en Melkbedrywighede',
        questions: [
            {
                id: 'ms1',
                type: 'yesnoNA',  // Ja/Nee/N.v.t.
                title: 'Kalfsterstesyfer onder 5% vir die maand?',
                hint: 'Berekening handleiding...'
            },
            {
                id: 'ms2',
                type: 'text',
                title: 'Rede vir afwyking',
                conditional: 'ms1:Nee'  // Wys slegs as ms1 = Nee
            },
            {
                id: 'ms4',
                type: 'choice',
                title: 'Koeie in melk maar nie gemelk nie',
                options: ['0 - 2', '3 - 5', '6+']
            },
            {
                id: 'ms19',
                type: 'multirating',
                title: 'Netheid gradering',
                items: ['Melkstal', 'Kantoor', ...],
                labels: ['Onaanvaarbaar', 'Swak', 'Aanvaarbaar', 'Goed', 'Uitstekend']
            },
            // ... 25 vrae oor 4 afdelings
        ]
    },
    // Afdelings: kuddebestuur, instandhouding, moraal, opmerkings
];
```

### 8.5 Dashboard Komponent (Vereenvoudig)

```javascript
const DashboardScreen = ({ user, cycle, subjects, completedSubjects, ... }) => {
    const pendingTopbestuur = subjects.filter(s => !completedSubjects.includes(s.id));
    const pendingMelkstal = subordinates.filter(s => !completedSubordinates.includes(s.id));

    return (
        <div className="min-h-screen bg-gradient-dark">
            {/* Header */}
            <div className="glass p-4">
                <h1>Welkom, {user.name}</h1>
                <p>Siklus: {cycle.name}</p>
            </div>

            {/* Vordering */}
            <ProgressRing completed={completedSubjects.length} total={subjects.length} />

            {/* Aksies */}
            {pendingTopbestuur.length > 0 && (
                <button onClick={() => setScreen('selectSubject')}>
                    Evalueer Topbestuur ({pendingTopbestuur.length} oor)
                </button>
            )}

            {user.role === 'topbestuur' && pendingMelkstal.length > 0 && (
                <button onClick={() => setScreen('selectMelkstal')}>
                    Evalueer Melkstal ({pendingMelkstal.length} oor)
                </button>
            )}
        </div>
    );
};
```

---

## 9. AANBEVELINGS VIR VEREENVOUDIGING

### Hoë Prioriteit

1. **Skei kode in aparte lêers** - komponente, utilities, konstantes
2. **Gebruik 'n build tool** - Vite of Create React App
3. **Verbeter fouthantering** - Spesifieke foutboodskappe per scenario
4. **Stoor vordering** - LocalStorage vir onvoltooide evaluasies

### Medium Prioriteit

5. **Vereenvoudig Melkstal vorm** - Minder vrae of beter groepering
6. **Voeg notifikasies by** - E-pos of push vir herinnerings
7. **Verbeter navigasie** - Duideliker terugknoppies en brodkrummels

### Lae Prioriteit

8. **Oorweeg alternatiewe backend** - Firebase, Supabase vir beter skaalbaarheid
9. **Voeg dashboards by** - Grafieke en tendense oor tyd
10. **Multi-taal ondersteuning** - Engels opsie

---

## 10. KONTAK EN ONDERHOUD

- **Repository:** GitHub (fjoos92-png/oostagri-perform)
- **Hosting:** GitHub Pages
- **API:** Google Apps Script (nuwe deployment per verandering)

**Om te deploy:**
1. Push na `main` branch
2. GitHub Pages update outomaties
3. Vir backend: Deploy nuwe weergawe in Apps Script en update API_URL in index.html
