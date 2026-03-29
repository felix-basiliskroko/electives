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
const TARGET_ECTS = 30;
const EMBEDDING_EDGE_THRESHOLD = 0.7;
const TOKEN_EDGE_THRESHOLD = 0.25;
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
const STOP_WORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'with', 'on', 'an', 'a', 'by', 'or']);

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

const tokenizeTopics = (topics = '') => {
  return topics
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
};

const computeTopicSimilarity = (tokensA = [], tokensB = []) => {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
};

const buildTokenGraph = (courses) => {
  if (!courses.length) return { nodes: [], edges: [] };
  const count = courses.length;
  const nodes = courses.map((course, index) => {
    const angle = (2 * Math.PI * index) / count;
    const radius = 42;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return {
      id: course.Course_Code,
      name: course.Course_Name,
      tokens: course.topicTokens || [],
      x,
      y
    };
  });

  const edges = [];
  const seen = new Set();
  nodes.forEach((node, index) => {
    const similarities = nodes
      .map((other, otherIndex) => {
        if (otherIndex === index) return null;
        const weight = computeTopicSimilarity(node.tokens, other.tokens);
        return weight > 0 ? { target: otherIndex, weight } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2);

    similarities.forEach(({ target, weight }) => {
      const key = `${Math.min(index, target)}-${Math.max(index, target)}`;
      if (!seen.has(key) && weight >= TOKEN_EDGE_THRESHOLD) {
        seen.add(key);
        edges.push({
          source: index,
          target,
          weight
        });
      }
    });
  });

  return { nodes, edges };
};

const buildEmbeddingGraph = (courses, embeddings) => {
  const nodes = courses
    .map((course, index) => {
      const vector = embeddings[course.Course_Code];
      if (!vector) return null;
      return {
        id: course.Course_Code,
        name: course.Course_Name,
        vector,
        index
      };
    })
    .filter(Boolean);

  if (!nodes.length) return { nodes: [], edges: [] };

  const normalizedVectors = nodes.map((node) => normalizeVector(node.vector));

  const edges = [];
  const seen = new Set();

  nodes.forEach((node, idx) => {
    const similarities = nodes
      .map((other, jdx) => {
        if (jdx === idx) return null;
        const weight = cosineSimilarity(normalizedVectors[idx], normalizedVectors[jdx]);
        return weight;
      })
      .map((weight, jdx) => (weight ? { target: jdx, weight } : null))
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    similarities.forEach(({ target, weight }) => {
      const key = `${Math.min(idx, target)}-${Math.max(idx, target)}`;
      if (!seen.has(key) && weight >= EMBEDDING_EDGE_THRESHOLD) {
        seen.add(key);
        edges.push({ source: idx, target, weight });
      }
    });
  });

  const clusterPositions = computeClusterLayout(normalizedVectors);

  const finalNodes = nodes.map((node, index) => ({
    id: node.id,
    name: node.name,
    x: clusterPositions[index].x,
    y: clusterPositions[index].y
  }));

  return { nodes: finalNodes, edges };
};

const cosineSimilarity = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
};

const normalizeVector = (vec) => {
  const mag = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / mag);
};

const computeClusterLayout = (vectors) => {
  const count = vectors.length;
  if (!count) return [];
  const clusterCount = Math.min(6, count);
  const { assignments } = runKMeans(vectors, clusterCount);
  const clusterMembers = new Map();
  assignments.forEach((clusterIndex, nodeIndex) => {
    if (!clusterMembers.has(clusterIndex)) clusterMembers.set(clusterIndex, []);
    clusterMembers.get(clusterIndex).push(nodeIndex);
  });

  const positions = new Array(count);
  const radius = 32;

  clusterMembers.forEach((members, clusterIndex) => {
    const angle = (2 * Math.PI * clusterIndex) / clusterMembers.size;
    const clusterCenter = {
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle)
    };
    const innerRadius = Math.min(9, 4 + members.length * 0.4);
    members.forEach((nodeIndex, localIndex) => {
      const localAngle = (2 * Math.PI * localIndex) / Math.max(members.length, 1);
      positions[nodeIndex] = {
        x: clusterCenter.x + innerRadius * Math.cos(localAngle),
        y: clusterCenter.y + innerRadius * Math.sin(localAngle)
      };
    });
  });

  return positions;
};

const runKMeans = (vectors, k, iterations = 20) => {
  let centroids = vectors.slice(0, k).map((vec) => vec.slice());
  let assignments = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < iterations; iter += 1) {
    assignments = vectors.map((vector) => {
      let bestIndex = 0;
      let bestScore = -Infinity;
      centroids.forEach((centroid, index) => {
        const score = cosineSimilarity(vector, centroid);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      return bestIndex;
    });

    const clusters = Array.from({ length: k }, () => []);
    assignments.forEach((clusterIndex, nodeIndex) => {
      clusters[clusterIndex].push(vectors[nodeIndex]);
    });

    centroids = clusters.map((members, index) => {
      if (!members.length) {
        const fallback = vectors[Math.floor(Math.random() * vectors.length)] || vectors[0];
        return fallback.slice();
      }
      const summed = new Array(members[0].length).fill(0);
      members.forEach((vector) => {
        vector.forEach((value, idx) => {
          summed[idx] += value;
        });
      });
      return normalizeVector(summed);
    });
  }

  return { assignments, centroids };
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

const CourseRow = ({ course, weeks, color, onRemove }) => (
  <div
    className="course-row"
    onDoubleClick={() => {
      if (onRemove) onRemove(course.Course_Code);
    }}
    title="Double-click to remove this course from the selection"
  >
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

const TopicGraph = ({ courses, selectedCodes, colorMap, embeddings, embeddingError }) => {
  const [hoveredId, setHoveredId] = useState(null);
  const graph = useMemo(() => {
    const embeddingEntries = Object.keys(embeddings || {});
    if (!courses.length) return { nodes: [], edges: [] };

    if (embeddingEntries.length) {
      return buildEmbeddingGraph(courses, embeddings);
    }

    return buildTokenGraph(courses);
  }, [courses, embeddings]);

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  if (!graph.nodes.length) {
    return (
      <div className="empty-state">
        {embeddingError || 'No course data for graph.'}
      </div>
    );
  }

  return (
    <div className="topic-graph">
      <svg viewBox="0 0 100 100" role="img" aria-label="Topic similarity graph">
        {graph.nodes.map((node) => {
          const isActive = selectedSet.has(node.id);
          const color = isActive ? colorMap[node.id] || '#94a3b8' : 'var(--border)';
          const fillOpacity = isActive ? 1 : 0.25;
          return (
            <g
              key={node.id}
              className="graph-node"
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={isActive ? 2.2 : 1.6}
                fill={color}
                fillOpacity={fillOpacity}
                stroke={isActive ? color : 'var(--border)'}
                strokeOpacity={isActive ? 1 : 0.4}
              >
                <title>{node.name}</title>
              </circle>
              {(isActive || hoveredId === node.id) && (
                <text x={node.x} y={node.y - 3} className="graph-label">
                  {node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

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
    return <div className="empty-state">Select courses to see overlap and course details.</div>;
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

        const examinerName = (course.Examiner || '').trim();

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
            <p className="detail-card__examiner">
              {examinerName ? `Examiner: ${examinerName}` : 'Examiner: TBD'}
            </p>
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
  const [embeddings, setEmbeddings] = useState({});
  const [embeddingError, setEmbeddingError] = useState(null);
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
            const topicTokens = tokenizeTopics(row.Key_Topics || row.Summary || '');
            return { ...row, weekList, weekLookup: lookup, topicTokens };
          });
        setCourses(normalized);
      })
      .catch(() => setError('Unable to load courses.json.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('./data/openai_embeddings.jsonl')
      .then((res) => {
        if (!res.ok) throw new Error('Embedding file not found.');
        return res.text();
      })
      .then((text) => {
        const lines = text.split('\n').filter((line) => line.trim().length);
        const map = {};
        lines.forEach((line) => {
          try {
            const record = JSON.parse(line);
            if (record.courseCode && Array.isArray(record.embedding)) {
              map[record.courseCode] = record.embedding;
            }
          } catch (e) {
            // ignore malformed lines
          }
        });
        setEmbeddings(map);
      })
      .catch((err) => setEmbeddingError(err.message));
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

  const totalDoubleBookedWeeks = useMemo(() => {
    return Object.values(overlapMap).reduce((sum, count) => sum + Math.max(count - 1, 0), 0);
  }, [overlapMap]);

  const totalSelectedCredits = useMemo(() => {
    return selectedCourses.reduce((sum, course) => {
      const credits = Number(course.Credits_Total);
      return sum + (Number.isFinite(credits) ? credits : 0);
    }, 0);
  }, [selectedCourses]);

  const meanOverlapShare = useMemo(() => {
    if (!selectedCourses.length) return 0;
    const shares = selectedCourses.map((course) => {
      if (!course.weekList.length) return 0;
      const overlappedWeeks = course.weekList.reduce(
        (acc, token) => acc + (overlapMap[token] > 1 ? 1 : 0),
        0
      );
      return overlappedWeeks / course.weekList.length;
    });
    const total = shares.reduce((a, b) => a + b, 0);
    return total / shares.length || 0;
  }, [selectedCourses, overlapMap]);

  const toggleCourse = (code) => {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const removeCourse = (code) => {
    setSelectedCodes((prev) => prev.filter((c) => c !== code));
  };

  const clearSelection = () => {
    setSelectedCodes([]);
  };

  const exportSelectedCourses = () => {
    if (!selectedCourses.length || typeof window === 'undefined') return;

    const header = ['Title', 'Code', 'Credits', 'Department', 'Studieinfo URL'];
    const rows = selectedCourses.map((course) => [
      course.Course_Name || '',
      course.Course_Code || '',
      Number(course.Credits_Total) || 0,
      course.Department || course.Faculty || '',
      course.Link || ''
    ]);

    const escapeCell = (value) => {
      const fallback = value === null || value === undefined ? '' : value;
      const stringValue = String(fallback);
      const needsWrap = /[",\n]/.test(stringValue);
      const escaped = stringValue.replace(/"/g, '""');
      return needsWrap ? `"${escaped}"` : escaped;
    };

    const csv = [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.setAttribute('download', `selected-electives-${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
        <h2>Possible electives to pick from:</h2>
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
              <div className="timeline-title">
                <h2>Overlap</h2>
                <button
                  type="button"
                  className="clear-selection-btn"
                  onClick={clearSelection}
                  disabled={!selectedCodes.length}
                >
                  Clear selection
                </button>
              </div>
              <p>{selectedCodes.length ? `${selectedCodes.length} course(s) selected` : 'Select courses to see any overlap.'}</p>
            </div>
            <div className="overlap-metrics">
              <div className="metric-card metric-card--credit">
                <span className="metric-label">ECTS selected</span>
                <div className="credit-metric">
                  <span className={`credit-total ${totalSelectedCredits >= TARGET_ECTS ? 'good' : 'warn'}`}>
                    {totalSelectedCredits}
                  </span>
                  <span className="credit-target">/{TARGET_ECTS}</span>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-label">Multi-booked weeks</span>
                <div className="metric-value">
                  <strong>{totalDoubleBookedWeeks}</strong>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-label">Mean overlap share</span>
                <div className="metric-value">
                  <strong>{`${Math.round(meanOverlapShare * 100)}%`}</strong>
                </div>
              </div>
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
                  onRemove={removeCourse}
                />
              ))
            ) : (
              <div className="empty-state">No courses selected yet.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <h3>Elective Details</h3>
            <button
              type="button"
              className="detail-export-btn"
              onClick={exportSelectedCourses}
              disabled={!selectedCourses.length}
            >
              Export
            </button>
          </div>
          <DetailPanel selected={selectedCourses} colorMap={colorMap} />
        </div>
        <div className="panel">
          <div className="panel-heading">
            <h3>Similarity Graph</h3>
            <span className="info-badge" role="img" aria-label="Graph info">
              ?
              <span className="info-tooltip">
                This graph uses openai's <strong>text-embedding-3-large</strong> embedding model to vectorize and embed elective courses and cluster them by cosine similarity.
                Nearby nodes share more topic overlap. Embedding was done soley based on the course syllabus.
              </span>
            </span>
          </div>
          <TopicGraph
            courses={courses}
            selectedCodes={selectedCodes}
            colorMap={colorMap}
            embeddings={embeddings}
            embeddingError={embeddingError}
          />
        </div>
        <div className="footer-note">
          This is an unofficial tool and is not affiliated with LiU or responsible for course data accuracy. Use at your own risk.
          {' '}
          <a
            href="https://github.com/felix-basiliskroko/electives"
            target="_blank"
            rel="noreferrer"
          >
            Find more information on GitHub ↗
          </a>
        </div>
      </section>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
