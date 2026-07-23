import {dbdelete}  from '../utills/DBdelete.js';

//마켓
export async function deleteMarket(req, res) {
  const { marketId } = req.params;

  try {
    const result = await dbdelete('markets', marketId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 마켓입니다.' });
    }

    return res.status(200).json({ success: true, message: '마켓이 삭제되었습니다.' });
  } catch (error) {
    console.error('마켓 삭제 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

//신청취소
export async function cancelApplication(req, res) {
  const { applicationId } = req.params;

  try {
    const result = await dbdelete('applications', applicationId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 신청입니다.' });
    }

    return res.status(200).json({ success: true, message: '신청이 취소되었습니다.' });
  } catch (error) {
    console.error('신청 취소 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}