function formatarNota(valor) {
  const numero = Number(valor);
  return Number.isNaN(numero) ? '-' : numero.toFixed(1);
}

async function buscarNotas() {
  const input = document.getElementById('inputMatricula');
  const matricula = input.value.trim();
  const msgErro = document.getElementById('msgErro');
  const resultado = document.getElementById('resultado');

  msgErro.classList.add('hidden');
  resultado.classList.add('hidden');

  if (!matricula) {
    msgErro.innerText = 'Por favor, informe a matrícula.';
    msgErro.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`/api/consulta-anonima?matricula=${encodeURIComponent(matricula)}`);
    const data = await res.json();

    if (!data.sucesso) {
      msgErro.innerText = data.mensagem || 'Estudante não encontrado.';
      msgErro.classList.remove('hidden');
      return;
    }


    document.getElementById('lblNome').innerText = data.aluno.nome;
    document.getElementById('lblTurma').innerText = data.aluno.turma;

    const tbody = document.getElementById('tabelaCorpo');
    tbody.innerHTML = '';

    if (!data.notas || data.notas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">Nenhuma nota cadastrada.</td></tr>`;
    } else {
      data.notas.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
          <td class="p-3 font-semibold text-slate-800">${item.disciplina}</td>
          <td class="p-3 text-center text-slate-700 font-medium">${formatarNota(item.trimestre1)}</td>
          <td class="p-3 text-center text-slate-700 font-medium">${formatarNota(item.trimestre2)}</td>
          <td class="p-3 text-center text-slate-700 font-medium">${formatarNota(item.trimestre3)}</td>
          <td class="p-3 text-center font-bold ${item.media >= 6.0 ? 'text-green-600' : 'text-red-600'}">${formatarNota(item.media)}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    resultado.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    msgErro.innerText = 'Erro ao conectar à API. Inicie o servidor com npm start.';
    msgErro.classList.remove('hidden');
  }
}
