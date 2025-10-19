const phoneNumberFormatter = function(number) {

    let formatted = number.replace(/\D/g, '');
  
    if (formatted.startsWith('0')) {
      formatted = '60' + formatted.substr(1);
    }else if (formatted.startsWith('1')){
        formatted = '60' + formatted
    }
    
    if (!formatted.endsWith('@c.us')) {
      formatted += '@c.us';
    }
  
    return formatted;
  }

  const phoneFormat = function(number) {

    let formatted = number.replace(/\D/g, '');
  
    if (formatted.startsWith('0')) {
      formatted = '60' + formatted.substr(1);
    }else if (formatted.startsWith('1')){
        formatted = '60' + formatted
    }
    else if (formatted.startsWith('+')){
        formatted = '60' + formatted
    }
  
    return formatted;
  }
  
  module.exports = {
    phoneNumberFormatter, phoneFormat
  }