const { useEffect, useMemo, useState } = React;

const COLOR_PALETTE = [
  '#0ea5e9',
  '#f97316',
  '#22c55e',
  '#8b5cf6',
  '#ec4899',
  '#eab308',
  '#06b6d4',
  '#64748b'
];

const MAX_WEEKS_PER_YEAR = 53;
const ASSESSMENT_KEYWORDS = [
  'computer-based exam',
  'computer exam',
  'digital exam',
  'take-home exam',
  'home exam',
  'written exam',
  'oral exam',
  'oral presentation',
  'lab presentation',
  'lab presentations',
  'project presentation',
  'lab report',
  'lab reports',
  'written project report',
  'project report',
  'group project',
  'group lab',
  'computer labs',
  'lab assignments',
  'computer assignments',
  'graded assignment',
  'problem-solving assignments',
  'assignments',
  'presentation',
  'presentations',
  'labs',
  'seminar'
].sort((a, b) => b.length - a.length);

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ASSESSMENT_REGEX = new RegExp(`(${ASSESSMENT_KEYWORDS.map(escapeRegExp).join('|')})`, 'gi');

const highlightAssessment = (text) => {
  if (!text || !ASSESSMENT_KEYWORDS.length) return text;
  return text.split(ASSESSMENT_REGEX).map((chunk, index) => {
    if (!chunk) return null;
    const isMatch = ASSESSMENT_KEYWORDS.some((keyword) => keyword.toLowerCase() === chunk.toLowerCase());
    return isMatch ? (
      <span key={`assessment-${index}`} className="assessment-highlight">{chunk}</span>
    ) : (
      chunk
    );
  });
};

const parseWeekToken = (token = '') => {
  if (!token || token.length !== 6) return null;
  return {
    year: Number(token.slice(0, 4)),
    week: Number(token.slice(4))
  };
};

const formatWeekToken = ({ year, week }) => `${year}${String(week).padStart(2, '0')}`;

const incrementWeek = ({ year, week }) => {
  let nextWeek = week + 1;
  let nextYear = year;
  if (nextWeek > MAX_WEEKS_PER_YEAR) {
    nextWeek = 1;
    nextYear += 1;
  }
  return { year: nextYear, week: nextWeek };
};

const expandWeekRange = (range = '') => {
  if (!range.includes('-')) return [];
  const [startToken, endToken] = range.split('-');
  const start = parseWeekToken(startToken);
  const end = parseWeekToken(endToken);
  if (!start || !end) return [];
  const weeks = [];
  let cursor = { ...start };
  let guard = 0;
  while (guard < 200) {
    weeks.push(formatWeekToken(cursor));
    if (cursor.year === end.year && cursor.week === end.week) break;
    cursor = incrementWeek(cursor);
    guard += 1;
  }
  return weeks;
};

const buildWeekUniverse = (courses) => {
  const set = new Set();
  courses.forEach((course) => {
    course.weekList.forEach((token) => set.add(token));
  });
  return Array.from(set).sort((a, b) => {
    const ay = Number(a.slice(0, 4));
    const by = Number(b.slice(0, 4));
    if (ay !== by) return ay - by;
    return Number(a.slice(4)) - Number(b.slice(4));
  });
};

const weekToLabel = (token) => {
  const year = token.slice(0, 4);
  const week = token.slice(4);
  return `W${week}
${year}`;
};

const useColorMap = (selectedCodes) => {
  return useMemo(() => {
    const map = {};
    selectedCodes.forEach((code, index) => {
      map[code] = COLOR_PALETTE[index % COLOR_PALETTE.length];
    });
    return map;
  }, [selectedCodes]);
};

const filterCourses = (courses, query, faculty) => {
  const q = query.trim().toLowerCase();
  return courses.filter((course) => {
    const matchesQuery = !q ||
      course.Course_Name.toLowerCase().includes(q) ||
      course.Course_Code.toLowerCase().includes(q);
    const matchesFaculty = faculty === 'all' || course.Faculty === faculty;
    return matchesQuery && matchesFaculty;
  });
};

const CourseCard = ({ course, isSelected, onToggle }) => (
  <div className="course-card">
    <div>
      <h4>{course.Course_Name}</h4>
      <small>
        {course.Course_Code} · {course.Credits_Total} ECTS · Module {course.Timetable_Module || '–'}
      </small>
      <div className="topic-chip">{course.Weeks || 'Weeks TBD'}</div>
    </div>
    <button className={isSelected ? 'remove' : ''} onClick={() => onToggle(course.Course_Code)}>
      {isSelected ? 'Remove' : 'Add'}
    </button>
  </div>
);

const CourseRow = ({ course, weeks, color }) => (
  <div className="course-row">
    <div className="course-meta">
      <strong style={{ color }}>{course.Course_Name}</strong>
      <small>
        {course.Course_Code} · {course.Credits_Total} ECTS · Weeks {course.Weeks || 'n/a'}
      </small>
    </div>
    {weeks.map((token) => {
      const active = course.weekLookup[token];
      return (
        <div
          key={`${course.Course_Code}-${token}`}
          className={`week-cell${active ? ' active' : ''}`}
          style={active ? { background: color } : undefined}
          title={`${course.Course_Name}
${weekToLabel(token)}`}
        />
      );
    })}
  </div>
);

const DetailPanel = ({ selected, colorMap }) => {
  const [expandedTopics, setExpandedTopics] = useState({});

  useEffect(() => {
    setExpandedTopics((prev) => {
      const next = {};
      selected.forEach((course) => {
        if (prev[course.Course_Code]) {
          next[course.Course_Code] = true;
        }
      });
      return next;
    });
  }, [selected]);

  const toggleTopics = (code) => {
    setExpandedTopics((prev) => {
      const next = { ...prev };
      if (next[code]) {
        delete next[code];
      } else {
        next[code] = true;
      }
      return next;
    });
  };

  if (!selected.length) {
    return <div className="empty-state">Select courses to see overlapping weeks and assessment details.</div>;
  }
  return (
    <div className="course-details">
      {selected.map((course, index) => {
        const topics = (course.Key_Topics || '')
          .split(';')
          .map((topic) => topic.trim())
          .filter(Boolean);
        const creditTokens = [
          Number(course.Written_Exam_Credits) > 0 && `Written ${course.Written_Exam_Credits} ECTS`,
          Number(course.Lab_Credits) > 0 && `Lab ${course.Lab_Credits} ECTS`,
          Number(course.Project_Report_Credits) > 0 && `Project ${course.Project_Report_Credits} ECTS`,
          Number(course.Oral_Credits) > 0 && `Oral ${course.Oral_Credits} ECTS`
        ].filter(Boolean);

        const accent = (colorMap && colorMap[course.Course_Code]) || '#0ea5e9';
        const isExpanded = Boolean(expandedTopics[course.Course_Code]);
        const topicsId = `topics-${course.Course_Code}`;

        return (
          <article
            className="detail-card"
            key={course.Course_Code}
            style={{ '--accent': accent }}
          >
            <div className="detail-card__header">
              <span className="detail-card__module">
                Elective {index + 1}
              </span>
              <span className="detail-card__ects">{course.Credits_Total} ECTS</span>
            </div>
            <h5>{course.Course_Name}</h5>
            <p className="summary">{course.Summary}</p>
            <div className="detail-card__assessment">
              <strong>Assessment</strong>
              <p>{highlightAssessment(course.Exam_Format)}</p>
              {creditTokens.length ? (
                <div className="credit-stack">
                  {creditTokens.map((label) => (
                    <span className="credit-chip" key={`${course.Course_Code}-${label}`}>{label}</span>
                  ))}
                </div>
              ) : null}
            </div>
            {topics.length ? (
              <div className="detail-card__topics">
                <button
                  type="button"
                  className={`topics-toggle${isExpanded ? ' expanded' : ''}`}
                  onClick={() => toggleTopics(course.Course_Code)}
                  aria-expanded={isExpanded}
                  aria-controls={topicsId}
                >
                  <strong>Key topics</strong>
                  <span className="topics-toggle__action">{isExpanded ? 'Hide' : 'Show'}</span>
                </button>
                <div className="topic-stack" id={topicsId} hidden={!isExpanded}>
                  {topics.map((topic) => (
                    <span className="topic-chip" key={`${course.Course_Code}-${topic}`}>{topic}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="detail-card__footer">
              <small>{course.Weeks ? `Weeks ${course.Weeks}` : 'Weeks TBD'}</small>
              <a href={course.Link} target="_blank" rel="noreferrer">Open Studieinfo ↗</a>
            </div>
          </article>
        );
      })}
    </div>
  );
};

const App = () => {
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState('');
  const [faculty, setFaculty] = useState('all');
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('liu-theme') || 'dark';
  });

  useEffect(() => {
    fetch('./courses.json')
      .then((res) => res.json())
      .then((data) => {
        const normalized = data
          .filter((row) => row.Course_Code && row.Course_Name)
          .map((row) => {
            const weekList = expandWeekRange(row.Weeks || '');
            const lookup = weekList.reduce((acc, token) => {
              acc[token] = true;
              return acc;
            }, {});
            return { ...row, weekList, weekLookup: lookup };
          });
        setCourses(normalized);
      })
      .catch(() => setError('Unable to load courses.json.'))
      .finally(() => setLoading(false));
  }, []);

  const faculties = useMemo(() => {
    const set = new Set();
    courses.forEach((c) => c.Faculty && set.add(c.Faculty));
    return Array.from(set).sort();
  }, [courses]);

  const weekUniverse = useMemo(() => buildWeekUniverse(courses), [courses]);

  const filteredCourses = useMemo(() => filterCourses(courses, query, faculty), [courses, query, faculty]);

  const selectedCourses = useMemo(() => courses.filter((c) => selectedCodes.includes(c.Course_Code)), [courses, selectedCodes]);

  const overlapMap = useMemo(() => {
    const map = {};
    selectedCourses.forEach((course) => {
      course.weekList.forEach((token) => {
        map[token] = (map[token] || 0) + 1;
      });
    });
    return map;
  }, [selectedCourses]);

  const colorMap = useColorMap(selectedCodes);

  const toggleCourse = (code) => {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('liu-theme', theme);
    }
  }, [theme]);

  if (loading) {
    return <div className="app-shell"><div className="panel">Loading courses…</div></div>;
  }

  if (error) {
    return <div className="app-shell"><div className="panel">{error}</div></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar panel">
        <h2>Pick electives</h2>
        <div className="theme-toggle">
          <label className="checkbox-toggle">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
            />
            <span>Dark mode</span>
          </label>
        </div>
        <div className="search">
          <input
            type="text"
            placeholder="Search by name or code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="selector">
          <select value={faculty} onChange={(e) => setFaculty(e.target.value)}>
            <option value="all">All faculties</option>
            {faculties.map((fac) => (
              <option value={fac} key={fac}>{fac}</option>
            ))}
          </select>
        </div>
        <div className="course-list">
          {filteredCourses.map((course) => (
            <CourseCard
              key={course.Course_Code}
              course={course}
              isSelected={selectedCodes.includes(course.Course_Code)}
              onToggle={toggleCourse}
            />
          ))}
          {!filteredCourses.length && <div className="empty-state">No courses match your filters.</div>}
        </div>
      </aside>

      <section className="grid-panel">
        <div className="panel">
          <div className="timeline-header">
            <div>
              <h2>Weekly overlap</h2>
              <p>{selectedCodes.length ? `${selectedCodes.length} course(s) selected` : 'Select courses to populate the grid.'}</p>
            </div>
            <div className="overlap-strip">
              <strong>Max overlap: {Math.max(0, ...Object.values(overlapMap))}</strong>
              <div className="bar" />
            </div>
          </div>
          <div className="timeline-grid">
            <div className="week-labels">
              <div>Course / Week</div>
              {weekUniverse.map((token) => (
                <div key={`label-${token}`} title={weekToLabel(token)}>{`W${token.slice(4)}`}</div>
              ))}
            </div>
            {selectedCourses.length ? (
              selectedCourses.map((course) => (
                <CourseRow
                  key={course.Course_Code}
                  course={course}
                  weeks={weekUniverse}
                  color={colorMap[course.Course_Code]}
                />
              ))
            ) : (
              <div className="empty-state">No courses selected yet.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <h3>Assessment & topics</h3>
          <DetailPanel selected={selectedCourses} colorMap={colorMap} />
        </div>
        <div className="footer-note">React + CDN build (requires internet for React/Babel). Serve with any static file server.</div>
      </section>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
