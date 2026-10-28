import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS ?? '',
  database: process.env.DB_NAME || 'fiel_db',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: true,
});

let freqCols = { t1: 'faltas_t1', t2: 'faltas_t2', t3: 'faltas_t3' };

async function prepararBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario VARCHAR(80) NOT NULL UNIQUE,
      senha VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [usuarios] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
  if (Number(usuarios[0]?.total || 0) === 0) {
    await pool.query(
      'INSERT INTO usuarios (usuario, senha) VALUES (?, ?)',
      ['admin', 'admin']
    );
  }

  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM frequencia');
    const names = cols.map((c) => c.Field);
    if (names.includes('faltas1')) {
      freqCols = { t1: 'faltas1', t2: 'faltas2', t3: 'faltas3' };
    }
  } catch {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS frequencia (
        id INT AUTO_INCREMENT PRIMARY KEY,
        matricula VARCHAR(20) NOT NULL,
        disciplina VARCHAR(100) NOT NULL,
        faltas_t1 INT UNSIGNED DEFAULT 0,
        faltas_t2 INT UNSIGNED DEFAULT 0,
        faltas_t3 INT UNSIGNED DEFAULT 0,
        UNIQUE KEY aluno_disciplina (matricula, disciplina)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }
}

function vazio(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

function notaOuNulo(valor) {
  const texto = vazio(valor);
  if (texto === null) return null;
  const numero = Number(texto);
  return Number.isNaN(numero) ? null : numero;
}

function mediaNotas(t1, t2, t3) {
  const notas = [t1, t2, t3]
    .map((n) => (n === null || n === undefined || n === '' ? NaN : Number(n)))
    .filter((n) => !Number.isNaN(n));
  if (notas.length === 0) return 0;
  return Number((notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1));
}

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/login', async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim();
  const senha = String(req.body?.senha || '').trim();

  try {
    const [rows] = await pool.query(
      'SELECT id, usuario FROM usuarios WHERE usuario = ? AND senha = ? LIMIT 1',
      [usuario, senha]
    );

    if (!rows.length) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuário ou senha incorretos!',
      });
    }

    const token = Buffer.from(`${rows[0].usuario}:${Date.now()}`).toString('base64');
    return res.json({
      sucesso: true,
      mensagem: 'Autenticado com sucesso',
      usuario: rows[0].usuario,
      token,
      redirect: '/includes/home.html',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ sucesso: false, mensagem: 'Erro no banco de dados.' });
  }
});

app.get('/api/estudantes', async (req, res) => {
  const matricula = `%${req.query.matricula || ''}%`;
  const nome = `%${req.query.nome || ''}%`;
  const turma = `%${req.query.turma || ''}%`;
  const turno = `%${req.query.turno || ''}%`;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const limite = Math.max(1, Number(req.query.limite) || 10);
  const offset = (pagina - 1) * limite;

  const where = `
    WHERE (? = '%%' OR matricula LIKE ?)
      AND (? = '%%' OR nome LIKE ?)
      AND (? = '%%' OR turma LIKE ?)
      AND (? = '%%' OR turno LIKE ?)
  `;
  const params = [matricula, matricula, nome, nome, turma, turma, turno, turno];

  try {
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM estudantes ${where}`,
      params
    );
    const totalRegistros = Number(countRow.total || 0);

    const [estudantes] = await pool.query(
      `SELECT matricula, nome, turma, turno, situacao, data_nascimento, nome_responsavel, email, telefone
       FROM estudantes
       ${where}
       ORDER BY matricula ASC
       LIMIT ? OFFSET ?`,
      [...params, limite, offset]
    );

    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / limite));
    return res.json({
      dados: estudantes,
      estudantes,
      totalPaginas,
      totalRegistros,
      pagina,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: err.message });
  }
});

app.get('/api/estudantes/:matricula', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM estudantes WHERE matricula = ? LIMIT 1',
      [req.params.matricula]
    );
    if (!rows.length) {
      return res.status(404).json({ erro: 'Estudante não encontrado.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro no banco de dados.' });
  }
});

app.post('/api/estudantes', async (req, res) => {
  const payload = req.body || {};
  try {
    await pool.query(
      `INSERT INTO estudantes
        (matricula, nome, turma, turno, situacao, data_nascimento, nome_responsavel, email, telefone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.matricula,
        payload.nome,
        payload.turma,
        payload.turno || 'Manhã',
        payload.situacao || 'Ativo',
        vazio(payload.data_nascimento),
        vazio(payload.nome_responsavel),
        vazio(payload.email),
        vazio(payload.telefone),
      ]
    );
    return res.status(201).json({ sucesso: true, mensagem: 'Estudante cadastrado com sucesso!' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.put('/api/estudantes/:matricula', async (req, res) => {
  const payload = req.body || {};
  try {
    const [result] = await pool.query(
      `UPDATE estudantes
       SET nome = ?, turma = ?, turno = ?, situacao = ?, nome_responsavel = ?, email = ?, telefone = ?
       WHERE matricula = ?`,
      [
        payload.nome,
        payload.turma,
        payload.turno || 'Manhã',
        payload.situacao || 'Ativo',
        vazio(payload.nome_responsavel),
        vazio(payload.email),
        vazio(payload.telefone),
        req.params.matricula,
      ]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ sucesso: false, erro: 'Estudante não encontrado.' });
    }
    return res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/notas/:matricula', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT disciplina,
              CAST(trimestre1 AS CHAR) AS trimestre1,
              CAST(trimestre2 AS CHAR) AS trimestre2,
              CAST(trimestre3 AS CHAR) AS trimestre3
       FROM notas
       WHERE matricula = ?
       ORDER BY disciplina ASC`,
      [req.params.matricula]
    );

    return res.json(
      rows.map((reg) => ({
        disciplina: reg.disciplina,
        notas: {
          trimestre1: reg.trimestre1,
          trimestre2: reg.trimestre2,
          trimestre3: reg.trimestre3,
        },
      }))
    );
  } catch (err) {
    console.error(err);
    return res.json([]);
  }
});

app.post('/api/notas/:matricula', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const nota of payload) {
      await conn.query(
        `INSERT INTO notas (matricula, disciplina, trimestre1, trimestre2, trimestre3)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           trimestre1 = VALUES(trimestre1),
           trimestre2 = VALUES(trimestre2),
           trimestre3 = VALUES(trimestre3)`,
        [
          req.params.matricula,
          nota.disciplina,
          notaOuNulo(nota.notas?.trimestre1),
          notaOuNulo(nota.notas?.trimestre2),
          notaOuNulo(nota.notas?.trimestre3),
        ]
      );
    }
    await conn.commit();
    return res.json({ sucesso: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  } finally {
    conn.release();
  }
});

app.get('/api/frequencia/:matricula', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT disciplina, ${freqCols.t1} AS faltas_t1, ${freqCols.t2} AS faltas_t2, ${freqCols.t3} AS faltas_t3
       FROM frequencia
       WHERE matricula = ?
       ORDER BY disciplina ASC`,
      [req.params.matricula]
    );
    return res.json(
      rows.map((reg) => ({
        disciplina: reg.disciplina,
        faltas: {
          faltas_t1: Number(reg.faltas_t1 || 0),
          faltas_t2: Number(reg.faltas_t2 || 0),
          faltas_t3: Number(reg.faltas_t3 || 0),
        },
      }))
    );
  } catch (err) {
    console.error(err);
    return res.json([]);
  }
});

app.post('/api/frequencia/:matricula', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of payload) {
      await conn.query(
        `INSERT INTO frequencia (matricula, disciplina, ${freqCols.t1}, ${freqCols.t2}, ${freqCols.t3})
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ${freqCols.t1} = VALUES(${freqCols.t1}),
           ${freqCols.t2} = VALUES(${freqCols.t2}),
           ${freqCols.t3} = VALUES(${freqCols.t3})`,
        [
          req.params.matricula,
          item.disciplina,
          Number(item.faltas?.faltas_t1 || 0),
          Number(item.faltas?.faltas_t2 || 0),
          Number(item.faltas?.faltas_t3 || 0),
        ]
      );
    }
    await conn.commit();
    return res.json({ sucesso: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  } finally {
    conn.release();
  }
});

app.get('/api/consulta-anonima', async (req, res) => {
  const matricula = String(req.query.matricula || '').trim();
  if (!matricula) {
    return res.json({ sucesso: false, mensagem: 'Matrícula não informada.' });
  }

  try {
    const [alunos] = await pool.query(
      'SELECT nome, turma FROM estudantes WHERE matricula = ? LIMIT 1',
      [matricula]
    );
    if (!alunos.length) {
      return res.json({ sucesso: false, mensagem: 'Estudante não encontrado.' });
    }

    const [notas] = await pool.query(
      `SELECT disciplina, trimestre1, trimestre2, trimestre3
       FROM notas WHERE matricula = ? ORDER BY disciplina ASC`,
      [matricula]
    );

    return res.json({
      sucesso: true,
      aluno: alunos[0],
      notas: notas.map((item) => ({
        disciplina: item.disciplina,
        trimestre1: Number(item.trimestre1 || 0),
        trimestre2: Number(item.trimestre2 || 0),
        trimestre3: Number(item.trimestre3 || 0),
        media: mediaNotas(item.trimestre1, item.trimestre2, item.trimestre3),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ sucesso: false, mensagem: 'Erro no banco de dados.' });
  }
});

const phpParaHtml = {
  '/index.php': '/index.html',
  '/login.php': '/login.html',
  '/logout.php': '/logout.html',
  '/includes/home.php': '/includes/home.html',
  '/includes/homeanon.php': '/includes/homeanon.html',
  '/error/404.php': '/error/404.html',
  '/error/500.php': '/error/500.html',
};

for (const [origem, destino] of Object.entries(phpParaHtml)) {
  app.get(origem, (_req, res) => res.redirect(destino));
}

app.use(express.static(root));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ erro: 'Rota não encontrada.' });
  }
  return res.status(404).sendFile(path.join(root, 'error', '404.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).sendFile(path.join(root, 'error', '500.html'));
});

const porta = Number(process.env.PORT || 3000);

prepararBanco()
  .then(() => {
    app.listen(porta, () => {
      console.log(`API e site FIEL em http://127.0.0.1:${porta}`);
      console.log('Login padrão (se o banco estiver vazio): admin / admin');
    });
  })
  .catch((err) => {
    console.error('Não foi possível conectar no MySQL (fiel_db).');
    console.error('Confira se o MySQL está ligado e se o banco fiel_db existe.');
    console.error(err.message);
    process.exit(1);
  });
