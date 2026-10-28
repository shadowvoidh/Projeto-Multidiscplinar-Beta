async function fazerLogin(event) {
      event.preventDefault();
      
      const usuario = document.getElementById('usuario').value.trim();
      const senha = document.getElementById('senha').value.trim();
      const msgErro = document.getElementById('msgErro');

      msgErro.classList.add('hidden');

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario, senha })
        });

        const data = await response.json();

        if (data.sucesso) {
          localStorage.setItem('fiel_token', data.token);
          window.location.href = 'includes/home.html';
        } else {
          msgErro.innerText = data.mensagem || 'Usuário ou senha incorretos!';
          msgErro.classList.remove('hidden');
        }
      } catch (err) {
        msgErro.innerText = 'Erro ao conectar à API. Inicie o servidor com npm start.';
        msgErro.classList.remove('hidden');
      }
    }
