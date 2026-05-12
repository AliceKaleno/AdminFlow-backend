import path from "path";
import { fileURLToPath } from "url";
import { conectarDB } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import http from "http";
import { Server } from "socket.io";

const app = express();

const db = await conectarDB();

/* =========================================
   📦 BANCO TEMPORÁRIO
========================================= */
const usuarios = [];

const atividades = [];

const vendas = [
  {
    cliente: "Empresa Alpha",
    valor: 1200,
    status: "Pago"
  },

  {
    cliente: "Loja Beta",
    valor: 850,
    status: "Pendente"
  },

  {
    cliente: "Tech Corp",
    valor: 2300,
    status: "Pago"
  }
];

const logs = [];

app.use(cors());
app.use(express.json());


/* =========================================
   🔌 SOCKET.IO
========================================= */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {

  console.log("✅ Usuário conectado");

  // 💬 CHAT
  socket.on("chat", (data) => {

    io.emit("chat", {
      usuario: data.usuario,
      mensagem: data.mensagem
    });

  });

});

/* =========================================
   🔒 MIDDLEWARE JWT
========================================= */
function authMiddleware(req, res, next) {

  const token = req.headers.authorization;

  if (!token) {

    return res.status(401).json({
      message: "Token não enviado"
    });

  }

  try {

    const decoded = jwt.verify(
      token,
      "segredo123"
    );

    req.user = decoded;

    next();

  } catch {

    return res.status(401).json({
      message: "Token inválido"
    });

  }

}

  function registrarAtividade(acao) {

  const novaAtividade = {
    acao,
    data: new Date(),
  };

  atividades.unshift(novaAtividade);

  io.emit("novaAtividade", novaAtividade);

}

function adicionarLog(acao, usuario) {

  logs.unshift({
    acao,
    usuario,
    data: new Date()
  });

  io.emit("logsUpdate");

}


/* =========================================
   👮 CONTROLE DE ROLE
========================================= */
function checkRole(role) {

  return (req, res, next) => {

    if (req.user.role !== role) {

      return res.status(403).json({
        message: "Acesso negado"
      });

    }

    next();

  };

}

/* =========================================
   🔐 LOGIN
========================================= */
app.post("/login", async (req, res) => {

  try {

    const { email, senha } = req.body;

    const usuario = await db.get(
  `
  SELECT * FROM usuarios
  WHERE email = ?
  `,
  [email]
);

    if (!usuario) {

      return res.status(401).json({
        message: "Usuário não encontrado"
      });

    }

    const senhaValida = await bcrypt.compare(
      senha,
      usuario.senha
    );

    if (!senhaValida) {

      return res.status(401).json({
        message: "Senha inválida"
      });

    }

    const token = jwt.sign(
      {
        email: usuario.email,
        role: usuario.role
      },
      "segredo123",
      {
        expiresIn: "1d"
      }
    );

    registrarAtividade(
  `🟢 ${usuario.nome} entrou no sistema`
);

    return res.json({
      success: true,
      token,

      usuario: {
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      }
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      message: "Erro interno no servidor"
    });

  }

});

/* =========================================
   🆕 CADASTRO
========================================= */
app.post("/register", async (req, res) => {

  try {

    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {

      return res.status(400).json({
        message: "Preencha todos os campos"
      });

    }

    const usuarioExistente = await db.get(
  `
  SELECT * FROM usuarios
  WHERE email = ?
  `,
  [email]
);

    if (usuarioExistente) {

      return res.status(400).json({
        message: "Email já cadastrado"
      });

    }

    const senhaHash = await bcrypt.hash(
      senha,
      10
    );

    const novoUsuario = {
      nome,
      email,
      senha: senhaHash,
      role: "vendedor"
    };

    await db.run(
  `
  INSERT INTO usuarios
  (nome, email, senha, role)
  VALUES (?, ?, ?, ?)
  `,
  [
    nome,
    email,
    senhaHash,
    "vendedor"
  ]
);

    adicionarLog(
  "Novo usuário cadastrado",
  novoUsuario.nome
);

    // 🔔 NOTIFICAÇÃO
    io.emit("notificacao", {
      mensagem: `Novo usuário cadastrado: ${nome} 🚀`
    });

    
    // 🔄 ATUALIZA DASHBOARD
    io.emit("dashboardUpdate");

    registrarAtividade(
  `👤 Novo usuário cadastrado: ${nome}`
);

    console.log("✅ Usuário criado:");
    console.log(novoUsuario);

    return res.json({
      success: true,
      usuario: novoUsuario
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      message: "Erro interno no servidor"
    });

  }

});

/* =========================================
   👥 LISTAR USUÁRIOS
========================================= */
app.get(
  "/usuarios",
  authMiddleware,
  checkRole("admin"),

  async (req, res) => {

    const usuarios = await db.all(
  `
  SELECT nome, email, role
  FROM usuarios
  `
);

return res.json(usuarios);

  }
);

/* =========================================
   💰 NOVA VENDA
========================================= */
app.post("/vendas", (req, res) => {

  try {

    const {
      cliente,
      valor,
      status
    } = req.body;

    if (!cliente || !valor || !status) {

      return res.status(400).json({
        message: "Preencha todos os campos"
      });

    }

    const novaVenda = {
      cliente,
      valor: Number(valor),
      status
    };

    vendas.push(novaVenda);

    adicionarLog(
  "Nova venda realizada",
  cliente
);

    // 🔔 NOTIFICAÇÃO
    io.emit("notificacao", {
      mensagem: `Nova venda para ${cliente} 💰`
    });

    io.emit("dashboardUpdate");

    registrarAtividade(
  `💰 Nova venda criada para ${cliente}`
);

    console.log("💰 Venda criada:");
    console.log(novaVenda);

    return res.json({
      success: true
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      message: "Erro ao criar venda"
    });

  }

});

app.get("/logs", (req, res) => {

  res.json(logs);

});

/* =========================================
   📦 LISTAR VENDAS
========================================= */
app.get("/vendas", (req, res) => {

  return res.json(vendas);

});

/* =========================================
   📊 DASHBOARD
========================================= */
app.get(
  "/dashboard",
  authMiddleware,

  async (req, res) => {

    const usuariosDB = await db.all(
  "SELECT * FROM usuarios"
);

const totalUsuarios =
  usuariosDB.length;

    const totalVendas =
      vendas.reduce(
        (acc, venda) =>
          acc + venda.valor,
        0
      );

    const crescimento =
      Math.floor(
        Math.random() * 20
      );

    return res.json({

      usuarios: totalUsuarios,

      vendas: totalVendas,

      crescimento,

      grafico: [
        { mes: "Jan", vendas: 4000 },
        { mes: "Fev", vendas: 8000 },
        { mes: "Mar", vendas: 6000 },
        { mes: "Abr", vendas: 9000 },
        { mes: "Mai", vendas: 7000 },
        { mes: "Jun", vendas: 8500 },
        { mes: "Jul", vendas: 9900 },
        { mes: "Ago", vendas: 7451 },
        { mes: "Set", vendas: 4526 },
        { mes: "Out", vendas: 5521 },
        { mes: "Nov", vendas: 2400 },
        { mes: "Dez", vendas: 9999 }
      ]

    });

  }
);

  app.get("/atividades", (req, res) => {

  res.json(atividades);

});

// =========================================
// 🔐 ALTERAR SENHA
// =========================================
app.put("/alterar-senha", async (req, res) => {

  try {

    const {
      email,
      senhaAtual,
      novaSenha
    } = req.body;

    const usuario = await db.get(
  `
  SELECT * FROM usuarios
  WHERE email = ?
  `,
  [email]
);

    if (!usuario) {

      return res.status(404).json({
        message: "Usuário não encontrado"
      });

    }

    const senhaCorreta =
      await bcrypt.compare(
        senhaAtual,
        usuario.senha
      );

    if (!senhaCorreta) {

      return res.status(401).json({
        message: "Senha atual incorreta"
      });

    }

    const novaSenhaHash =
      await bcrypt.hash(
        novaSenha,
        10
      );

    await db.run(
  `
  UPDATE usuarios
  SET senha = ?
  WHERE email = ?
  `,
  [novaSenhaHash, email]
);

    return res.json({
      success: true
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      message: "Erro interno"
    });

  }

});

app.use(
  express.static(
    path.join(__dirname, "../frontend/dist")
  )
);


/* =========================================
   🚀 START
========================================= */
server.listen(3000, () => {

  console.log(
    "🚀 API rodando na porta 3000"
  );

});
